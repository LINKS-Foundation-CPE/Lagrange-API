import request from "supertest";
import * as mockData from "../utils/mockData.ts";
import dataInitializer from "../utils/dataInitializer.ts";
import * as repo from "../../src/repositories/job.repository.ts";
import * as budgetEventRepo from "../../src/repositories/budgetEvent.repository.ts";
import * as reservationRepo from "../../src/repositories/reservation.repository.ts";
import * as tagRepo from "../../src/repositories/tag.repository.ts";
import * as organizationRepo from "../../src/repositories/organization.repository.ts";
import { Organization, Project, User } from "../../src/models/index.ts";
import { DateTime } from "luxon";

describe("jobReport routes", () => {
  const initializer = new dataInitializer();

  it("should return response type as 'text/plain'", async () => {
    const res = await request(global.__APP__).get(`/metrics/jobs`).expect(200);
    expect(res.type).toBe("text/plain");
  });

  it("should return statusless jobs as 'unknown'", async () => {
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser();
    const project = await initializer.initNoFreeQueueProject(polito);

    const job = await repo.create({
      jobid: "valid-job-id",
      organization_id: polito.id,
      project_id: project.id,
      user_id: user.id,
      status: undefined,
      execution_start: undefined,
      execution_end: undefined,
      submitted_datetime: new Date(),
      submitted_circuit: undefined,
      results: undefined,
      usedReservation: false,
    });

    const res = await request(global.__APP__).get(`/metrics/jobs`).expect(200);

    // convert text to object
    const fields = res.text.split("\n");
    const red = fields.map((el) => el.split(" "));
    const obj = Object.fromEntries(red);

    expect(obj).toHaveProperty("jobs_unknown", "1");
  });

  it("should correctly count all jobs", async () => {
    const polito = await initializer.initPolitoOrganization();
    const user = await initializer.initPolitoUser();
    const project = await initializer.initFreeQueueProject(polito);

    await repo.create({
      jobid: "valid-job-id",
      organization_id: polito.id,
      project_id: project.id,
      user_id: user.id,
      status: undefined,
      execution_start: undefined,
      execution_end: undefined,
      submitted_datetime: new Date(),
      submitted_circuit: undefined,
      results: undefined,
      usedReservation: false,
    });

    await repo.create({
      jobid: "valid-job-id-1",
      organization_id: polito.id,
      project_id: project.id,
      user_id: user.id,
      status: "ready",
      execution_start: undefined,
      execution_end: undefined,
      submitted_datetime: new Date(),
      submitted_circuit: undefined,
      results: undefined,
      usedReservation: false,
    });

    await repo.create({
      jobid: "valid-job-id-2",
      organization_id: polito.id,
      project_id: project.id,
      user_id: user.id,
      status: "ready",
      execution_start: undefined,
      execution_end: undefined,
      submitted_datetime: new Date(),
      submitted_circuit: undefined,
      results: undefined,
      usedReservation: false,
    });

    await repo.create({
      jobid: "valid-job-id-1",
      organization_id: polito.id,
      project_id: project.id,
      user_id: user.id,
      status: "failed",
      execution_start: undefined,
      execution_end: undefined,
      submitted_datetime: new Date(),
      submitted_circuit: undefined,
      results: undefined,
      usedReservation: false,
    });

    const res = await request(global.__APP__).get(`/metrics/jobs`).expect(200);

    // convert text to object
    const fields = res.text.split("\n");
    const red = fields.map((el) => el.split(" "));
    const obj = Object.fromEntries(red);

    expect(obj).toHaveProperty("jobs_unknown", "1");
    expect(obj).toHaveProperty("jobs_failed", "1");
    expect(obj).toHaveProperty("jobs_ready", "2");
    expect(obj).toHaveProperty("jobs_total", "4");
  });
});

/**
 * Per-organization series.
 *
 * The counts are strict: attribution runs job -> project -> organization, so
 * each job lands on exactly one organization and a parent does not absorb the
 * jobs of the organizations that reference it.
 */
describe("per-organization metrics", () => {
  const initializer = new dataInitializer();

  /** `name{a="1",b="2"} 3` -> value, or undefined when the series is absent. */
  const sample = (text: string, name: string, organizationId: number) => {
    const line = text
      .split("\n")
      .find(
        (l) =>
          l.startsWith(`${name}{`) &&
          l.includes(`organization_id="${organizationId}"`),
      );
    return line?.split(" ").pop();
  };

  const makeJob = (
    jobid: string,
    org: Organization,
    project: Project,
    user: User,
  ) =>
    repo.create({
      jobid,
      organization_id: org.id,
      project_id: project.id,
      user_id: user.id,
      status: "ready",
      execution_start: undefined,
      execution_end: undefined,
      submitted_datetime: new Date(),
      submitted_circuit: undefined,
      results: undefined,
      usedReservation: false,
    });

  it("counts jobs per organization without rolling sub-orgs into the parent", async () => {
    const parent = await initializer.initOrganization("Parent Org");
    const child = await initializer.initOrganization("Child Org", parent.id);
    const user = await initializer.initUser({
      email: "metrics-jobs@example.org",
      sub: "metrics-jobs",
      organization_id: parent.id,
    });
    const parentProject = await initializer.initFreeQueueProject(parent);
    const childProject = await initializer.initFreeQueueProject(child);

    await makeJob("p-1", parent, parentProject, user);
    await makeJob("c-1", child, childProject, user);
    await makeJob("c-2", child, childProject, user);

    const res = await request(global.__APP__).get("/metrics/jobs").expect(200);

    // The parent has one job of its own; the child's two stay on the child.
    expect(sample(res.text, "jobs_by_organization", parent.id)).toBe("1");
    expect(sample(res.text, "jobs_by_organization", child.id)).toBe("2");
    // And the strict counts still add up to the unlabelled total.
    expect(res.text).toContain("jobs_total 3");
  });

  it("reports zero for an organization that has never run a job", async () => {
    const org = await initializer.initOrganization("Idle Org");
    const res = await request(global.__APP__).get("/metrics/jobs").expect(200);
    expect(sample(res.text, "jobs_by_organization", org.id)).toBe("0");
    expect(sample(res.text, "reservations_by_organization", org.id)).toBe("0");
  });

  it("counts reservations per organization", async () => {
    const org = await initializer.initOrganization("Booking Org");
    const other = await initializer.initOrganization("Quiet Org");
    const user = await initializer.initUser({
      email: "metrics-res@example.org",
      sub: "metrics-res",
      organization_id: org.id,
    });
    const project = await initializer.initFreeQueueProject(org);

    for (const n of [1, 2]) {
      await reservationRepo.create({
        project_id: project.id,
        made_by: user.id,
        slot_id: null,
        day: DateTime.now().plus({ days: n }).toJSDate(),
        start: DateTime.now().plus({ days: n }).toJSDate(),
        end: DateTime.now().plus({ days: n, hours: 1 }).toJSDate(),
        description: null,
      });
    }

    const res = await request(global.__APP__).get("/metrics/jobs").expect(200);
    expect(sample(res.text, "reservations_by_organization", org.id)).toBe("2");
    expect(sample(res.text, "reservations_by_organization", other.id)).toBe(
      "0",
    );
  });

  it("escapes label values so a quoted name cannot break the scrape", async () => {
    const org = await initializer.initOrganization('Ac"me\\Labs');
    const res = await request(global.__APP__).get("/metrics/jobs").expect(200);
    expect(res.text).toContain(
      `jobs_by_organization{organization_id="${org.id}",organization="Ac\\"me\\\\Labs"}`,
    );
  });
});

/**
 * The platform-wide, per-project and per-tag series.
 *
 * QPU seconds are the executed window, `execution_end - execution_start`,
 * summed over every job — including jobs that ran inside a reservation, which
 * the billing reports exclude to avoid billing that time twice. These measure
 * machine time consumed, not money owed.
 */
describe("platform, project and tag metrics", () => {
  const initializer = new dataInitializer();

  /** The value of the first `name{...}` line whose labels contain `fragment`. */
  const labelled = (text: string, name: string, fragment: string) =>
    text
      .split("\n")
      .find((l) => l.startsWith(`${name}{`) && l.includes(fragment))
      ?.split(" ")
      .pop();

  /** The value of an unlabelled series. */
  const plain = (text: string, name: string) =>
    text
      .split("\n")
      .find((l) => l.startsWith(`${name} `))
      ?.split(" ")
      .pop();

  const scrape = async () =>
    (await request(global.__APP__).get("/metrics/jobs").expect(200)).text;

  const ran = (
    jobid: string,
    org: Organization,
    project: Project,
    user: User,
    seconds: number,
    usedReservation = false,
  ) => {
    const start = DateTime.now().minus({ hours: 1 });
    return repo.create({
      jobid,
      organization_id: org.id,
      project_id: project.id,
      user_id: user.id,
      status: "ready",
      execution_start: start.toJSDate(),
      execution_end: start.plus({ seconds }).toJSDate(),
      submitted_datetime: new Date(),
      submitted_circuit: undefined,
      results: undefined,
      usedReservation,
    });
  };

  it("counts users and groups them by the domain of their address", async () => {
    const org = await initializer.initOrganization("Domain Org");
    await initializer.initUser({
      email: "s1@studenti.polito.it",
      sub: "s1",
      organization_id: org.id,
    });
    await initializer.initUser({
      email: "s2@studenti.polito.it",
      sub: "s2",
      organization_id: org.id,
    });
    await initializer.initUser({
      email: "staff@polito.it",
      sub: "staff",
      organization_id: org.id,
    });

    const text = await scrape();
    expect(plain(text, "users_total")).toBe("3");
    expect(
      labelled(text, "users_by_email_domain", 'domain="studenti.polito.it"'),
    ).toBe("2");
    expect(labelled(text, "users_by_email_domain", 'domain="polito.it"')).toBe(
      "1",
    );
  });

  it("counts projects per tag, including a tag nobody uses", async () => {
    const org = await initializer.initOrganization("Tagged Org");
    const first = await initializer.initFreeQueueProject(org);
    const second = await initializer.initFreeQueueProject(org);

    const teaching = await tagRepo.create("teaching");
    const research = await tagRepo.create("research");
    const unused = await tagRepo.create("unused");

    // A project may carry several tags, so these series overlap on purpose.
    await tagRepo.setForProject(first.id, [teaching.id, research.id]);
    await tagRepo.setForProject(second.id, [research.id]);

    const text = await scrape();
    expect(labelled(text, "projects_by_tag", `tag_id="${teaching.id}"`)).toBe(
      "1",
    );
    expect(labelled(text, "projects_by_tag", `tag_id="${research.id}"`)).toBe(
      "2",
    );
    expect(labelled(text, "projects_by_tag", `tag_id="${unused.id}"`)).toBe(
      "0",
    );
  });

  it("counts jobs per project and reports zero for an idle one", async () => {
    const org = await initializer.initOrganization("Busy Org");
    const busy = await initializer.initFreeQueueProject(org);
    const idle = await initializer.initFreeQueueProject(org);
    const user = await initializer.initUser({
      email: "per-project@example.org",
      sub: "per-project",
      organization_id: org.id,
    });

    await ran("pp-1", org, busy, user, 10);
    await ran("pp-2", org, busy, user, 10);

    const text = await scrape();
    expect(labelled(text, "jobs_by_project", `project_id="${busy.id}"`)).toBe(
      "2",
    );
    expect(labelled(text, "jobs_by_project", `project_id="${idle.id}"`)).toBe(
      "0",
    );
    // The organization is carried as a label, so a panel can group by it.
    expect(
      labelled(text, "jobs_by_project", `organization_id="${org.id}"`),
    ).toBeDefined();
  });

  it("sums executed QPU seconds per project and per organization", async () => {
    const org = await initializer.initOrganization("Usage Org");
    const other = await initializer.initOrganization("Idle Org");
    const project = await initializer.initFreeQueueProject(org);
    const user = await initializer.initUser({
      email: "usage@example.org",
      sub: "usage",
      organization_id: org.id,
    });

    await ran("u-1", org, project, user, 90);
    await ran("u-2", org, project, user, 30);

    const text = await scrape();
    expect(
      labelled(text, "qpu_seconds_by_project", `project_id="${project.id}"`),
    ).toBe("120");
    expect(
      labelled(
        text,
        "qpu_seconds_by_organization",
        `organization_id="${org.id}"`,
      ),
    ).toBe("120");
    expect(
      labelled(
        text,
        "qpu_seconds_by_organization",
        `organization_id="${other.id}"`,
      ),
    ).toBe("0");
  });

  it("counts time a job spent inside a reservation, unlike the billing reports", async () => {
    const org = await initializer.initOrganization("Reserved Org");
    const project = await initializer.initFreeQueueProject(org);
    const user = await initializer.initUser({
      email: "reserved@example.org",
      sub: "reserved",
      organization_id: org.id,
    });

    await ran("r-1", org, project, user, 45, true);

    const text = await scrape();
    expect(
      labelled(text, "qpu_seconds_by_project", `project_id="${project.id}"`),
    ).toBe("45");
  });

  it("reports an organization with no projects at all, and invents no project for it", async () => {
    // Not initOrganization, which creates a vault project. Both levels come
    // from one grouped query, and an organization with nothing under it
    // produces a project-level row whose project is null; that row is its
    // total, not a project, and must not reach `jobs_by_project`.
    const empty = await organizationRepo.create({
      name: "Projectless Org",
      reference_organization_id: null,
    });

    const text = await scrape();
    expect(
      labelled(text, "jobs_by_organization", `organization_id="${empty.id}"`),
    ).toBe("0");
    expect(
      labelled(
        text,
        "qpu_seconds_by_organization",
        `organization_id="${empty.id}"`,
      ),
    ).toBe("0");
    expect(
      text
        .split("\n")
        .filter(
          (l) =>
            l.startsWith("jobs_by_project{") &&
            l.includes(`organization_id="${empty.id}"`),
        ),
    ).toEqual([]);
  });

  it("ignores a job that never ran and one whose window ends before it starts", async () => {
    const org = await initializer.initOrganization("Odd Org");
    const project = await initializer.initFreeQueueProject(org);
    const user = await initializer.initUser({
      email: "odd@example.org",
      sub: "odd",
      organization_id: org.id,
    });

    await ran("o-1", org, project, user, 60);
    // Never executed: counted as a job, contributing no seconds.
    await repo.create({
      jobid: "o-2",
      organization_id: org.id,
      project_id: project.id,
      user_id: user.id,
      status: "ready",
      execution_start: undefined,
      execution_end: undefined,
      submitted_datetime: new Date(),
      submitted_circuit: undefined,
      results: undefined,
      usedReservation: false,
    });
    // Reversed window: discarded rather than subtracted.
    await ran("o-3", org, project, user, -30);

    const text = await scrape();
    expect(
      labelled(text, "jobs_by_project", `project_id="${project.id}"`),
    ).toBe("3");
    expect(
      labelled(text, "qpu_seconds_by_project", `project_id="${project.id}"`),
    ).toBe("60");
  });
});
