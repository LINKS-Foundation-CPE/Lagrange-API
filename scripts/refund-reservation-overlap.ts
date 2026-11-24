/**
 * Refund the time a reservation paid for twice.
 *
 * Jobs that executed inside their project's reservation but were billed in
 * full (because coverage used to be decided at submission) are refunded the
 * part the current rule does not charge. Dry run unless --apply is given.
 *
 *   npx tsx scripts/refund-reservation-overlap.ts <reservation id> [--apply]
 *
 * In the deployment: docker compose exec quantum-api npx tsx scripts/refund-reservation-overlap.ts 151
 *
 * Idempotent: billing transactions an earlier overlap refund covered are
 * skipped. See src/services/reservationRefund.service.ts.
 */
import "dotenv/config";
import sequelize from "../src/config/database.ts";
import { initModels } from "../src/models/index.ts";
import {
  applyReservationRefund,
  planReservationRefund,
} from "../src/services/reservationRefund.service.ts";

const [idArg, ...flags] = process.argv.slice(2);
const reservationId = Number(idArg);
if (!Number.isInteger(reservationId) || reservationId <= 0) {
  console.error(
    "usage: refund-reservation-overlap.ts <reservation id> [--apply]",
  );
  process.exit(2);
}
const apply = flags.includes("--apply");

initModels(sequelize);
try {
  const plan = await planReservationRefund(reservationId);
  const r = plan.reservation;
  console.log(
    `Reservation ${r.id}, project ${plan.project.name} (${plan.project.id}): ${r.start.toISOString()} - ${r.end.toISOString()}`,
  );
  if (plan.already_refunded.length > 0) {
    console.log(
      `Already refunded earlier, skipped: tx ${plan.already_refunded.join(", ")}`,
    );
  }
  if (plan.lines.length === 0) {
    console.log("Nothing to refund.");
  } else {
    console.table(plan.lines);
    console.log(
      `Total refund: ${plan.total} ms (${(plan.total / 60000).toFixed(2)} min)`,
    );
    console.log(
      `Project budget: ${plan.project.remaining_budget} -> ${plan.project.remaining_budget + plan.total}`,
    );
    if (apply) {
      const events = await applyReservationRefund(plan);
      console.log(`Applied: ledger transaction(s) ${events.join(", ")}`);
    } else {
      console.log("Dry run: nothing written. Re-run with --apply to refund.");
    }
  }
} finally {
  await sequelize.close();
}
