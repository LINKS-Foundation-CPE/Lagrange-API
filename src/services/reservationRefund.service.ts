import { Op } from "sequelize";
import {
  BudgetEvent,
  Job,
  Project,
  Reservation,
  transactionManager,
} from "../models/index.ts";
import { coverageFor } from "./reservationCoverage.ts";
import { ledgerDescription, ledgerWindow } from "../utils/ledgerTime.ts";

/**
 * Refunds for jobs billed for time a reservation had already paid.
 *
 * Before coverage was decided from the execution window, a job submitted just
 * before its project's reservation and executed inside it was billed in full:
 * the reserved time was paid twice. This finds those charges for one
 * reservation and gives back the part the current rule would not have charged
 * (see `reservationCoverage`), so a job billed under the current rule, or
 * wholly outside the reservation, is refunded nothing.
 *
 * Idempotent: a billing transaction named in an earlier overlap refund is
 * skipped, so running it twice refunds once.
 */

/** Tag in the description of every refund this writes, for idempotency. */
export const REFUND_TAG = "overlap-refund";

export interface RefundLine {
  job_id: number;
  jobid: string;
  billing_tx: number;
  billed: number;
  /** What the current rule charges for this job (its execution outside reservations). */
  due: number;
  refund: number;
  inside_ms: number;
  duration_ms: number;
  /** The project's reservations the execution overlapped. */
  reservation_ids: number[];
}

export interface RefundPlan {
  reservation: { id: number; project_id: number; start: Date; end: Date };
  project: { id: number; name: string; remaining_budget: number };
  lines: RefundLine[];
  /** Billing transactions skipped because an earlier refund already covered them. */
  already_refunded: number[];
  total: number;
}

const billingEventsFor = (job: Job) =>
  BudgetEvent.findAll({
    where: {
      project_id: job.project_id,
      billing: true,
      value: { [Op.lt]: 0 },
      // Every job charge names the job first: "Job <jobid> (<id>) ...".
      description: { [Op.like]: `Job ${job.jobid} (${job.id})%` },
    },
    order: [["id", "ASC"]],
  });

const previouslyRefundedTx = async (
  projectId: number,
): Promise<Set<number>> => {
  const refunds = await BudgetEvent.findAll({
    where: {
      project_id: projectId,
      value: { [Op.gt]: 0 },
      description: { [Op.like]: `%${REFUND_TAG}%` },
    },
  });
  const ids = new Set<number>();
  for (const r of refunds) {
    const match = /tx ([\d,]+)/.exec(r.description ?? "");
    match?.[1].split(",").forEach((id) => ids.add(Number(id)));
  }
  return ids;
};

export const planReservationRefund = async (
  reservationId: number,
): Promise<RefundPlan> => {
  const reservation = await Reservation.findByPk(reservationId);
  if (!reservation) throw new Error(`reservation ${reservationId} not found`);
  const project = await Project.findByPk(reservation.project_id);
  if (!project) throw new Error(`project ${reservation.project_id} not found`);

  const jobs = await Job.findAll({
    where: {
      project_id: reservation.project_id,
      execution_start: { [Op.lt]: reservation.end },
      execution_end: { [Op.gt]: reservation.start },
    },
    order: [["execution_start", "ASC"]],
  });

  const refunded = await previouslyRefundedTx(project.id);
  const lines: RefundLine[] = [];
  const already: number[] = [];

  for (const job of jobs) {
    if (!job.execution_start || !job.execution_end) continue;
    const events = await billingEventsFor(job);
    if (events.length === 0) continue; // not billed: nothing to give back
    if (events.some((e) => refunded.has(e.id))) {
      already.push(...events.map((e) => e.id));
      continue;
    }
    const billed = events.reduce((sum, e) => sum - Number(e.value), 0);
    // Every reservation of the project, not only this one: the charge is
    // compared with what the current rule would have billed for this job.
    const coverage = await coverageFor(job.project_id, {
      start: job.execution_start,
      end: job.execution_end,
    });
    if (coverage.durationMs === 0) continue;
    // The full charge the job carried before coverage: a reported billable
    // amount if it had one, otherwise its execution time.
    const full =
      job.billable !== null && job.billable !== undefined
        ? Number(job.billable)
        : coverage.durationMs;
    const due = Math.round((full * coverage.outsideMs) / coverage.durationMs);
    const refund = Math.max(0, billed - due);
    if (refund === 0) continue;
    lines.push({
      job_id: job.id,
      jobid: job.jobid,
      billing_tx: events[events.length - 1].id,
      billed,
      due,
      refund,
      inside_ms: coverage.insideMs,
      duration_ms: coverage.durationMs,
      reservation_ids: coverage.reservationIds,
    });
  }

  return {
    reservation: {
      id: reservation.id,
      project_id: reservation.project_id,
      start: reservation.start,
      end: reservation.end,
    },
    project: {
      id: project.id,
      name: project.name,
      remaining_budget: Number(project.remaining_budget),
    },
    lines,
    already_refunded: already,
    total: lines.reduce((sum, l) => sum + l.refund, 0),
  };
};

/**
 * Writes the refund: one ledger credit naming the billing transactions it
 * corrects and the reservation, the project's budget raised by the same
 * amount, and the jobs marked as having run inside a reservation. A plan
 * whose transactions do not fit one description is split over several
 * credits, each naming its own. All in one database transaction.
 */
export const applyReservationRefund = async (
  plan: RefundPlan,
): Promise<number[]> => {
  if (plan.total === 0) return [];
  const header = (txs: number[], amount: number) =>
    `Refund ${amount} ms (${REFUND_TAG}): tx ${txs.join(",")} billed time inside reservation ${plan.reservation.id} (${ledgerWindow(plan.reservation.start, plan.reservation.end)})`;

  // Pack lines into as few credits as fit in 255 characters.
  const chunks: RefundLine[][] = [];
  let current: RefundLine[] = [];
  for (const line of plan.lines) {
    const candidate = [...current, line];
    const amount = candidate.reduce((s, l) => s + l.refund, 0);
    if (
      current.length > 0 &&
      header(
        candidate.map((l) => l.billing_tx),
        amount,
      ).length > 255
    ) {
      chunks.push(current);
      current = [line];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) chunks.push(current);

  return transactionManager.withTransaction(async (tx) => {
    const project = await Project.findByPk(plan.project.id, {
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });
    if (!project) throw new Error(`project ${plan.project.id} not found`);
    const created: number[] = [];
    for (const chunk of chunks) {
      const amount = chunk.reduce((s, l) => s + l.refund, 0);
      const event = await BudgetEvent.create(
        {
          project_id: project.id,
          value: amount,
          billing: true,
          description: ledgerDescription(
            header(
              chunk.map((l) => l.billing_tx),
              amount,
            ),
          ),
        },
        { transaction: tx },
      );
      created.push(event.id);
    }
    project.remaining_budget = Number(project.remaining_budget) + plan.total;
    await project.save({ transaction: tx });
    for (const line of plan.lines) {
      await Job.update(
        {
          usedReservation: true,
          reservation_ids: line.reservation_ids,
          reservation_covered_ms: line.inside_ms,
        },
        { where: { id: line.job_id }, transaction: tx },
      );
    }
    return created;
  });
};
