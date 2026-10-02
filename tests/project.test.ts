import * as repo from "../src/repositories/project.repository";
import dataInitializer from "./utils/dataInitializer.ts";

describe("Project repo", () => {
  const initializer = new dataInitializer();

  it("should create a project", async () => {
    const links = await initializer.initLinksOrganization();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });

    const project = await repo.create({
      name: "Test Project",
      free_queue: null,
      organization_id: links.id,
    });

    expect(project.id).toBeDefined();
    expect(project.organization_id).toBe(links.id);
  });

  it("should get a project", async () => {
    const links = await initializer.initLinksOrganization();
    const linksUser = await initializer.initLinksUser();
    const linksManagerUser = await initializer.initLinksUser({
      organization_manager: true,
    });

    const originalProject = await initializer.initFreeQueueProject(
      links,
      1000000000,
    );

    const project = await repo.getOne(originalProject.id);

    expect(project).toBeDefined();

    expect(project?.id).toBeDefined();
    expect(project?.id).toBe(originalProject.id);
    expect(project?.name).toBe(originalProject.name);
    expect(project?.organization_id).toBe(links.id);
    expect(Number(project?.remaining_budget)).toBe(1000000000);
    expect(project?.total_freequeue_time).toBeDefined();
    expect(Number(project?.total_freequeue_time)).toBe(0);
  });

  it("should sum free queue job durations in total_freequeue_time", async () => {
    const links = await initializer.initLinksOrganization();
    const linksUser = await initializer.initLinksUser();
    const project = await initializer.initFreeQueueProject(links);

    const now = new Date();
    await initializer.initJob({
      project,
      user: linksUser,
      org: links,
      execution_start: new Date(now.getTime() - 10000),
      execution_end: new Date(now.getTime() - 8000), // 2000ms
      usedReservation: false,
    });
    await initializer.initJob({
      project,
      user: linksUser,
      org: links,
      execution_start: new Date(now.getTime() - 7000),
      execution_end: new Date(now.getTime() - 4000), // 3000ms
      usedReservation: false,
    });

    const fetched = await repo.getOne(project.id);
    expect(Number(fetched?.total_freequeue_time)).toBe(5000);
  });

  it("should exclude reservation jobs from total_freequeue_time", async () => {
    const links = await initializer.initLinksOrganization();
    const linksUser = await initializer.initLinksUser();
    const project = await initializer.initFreeQueueProject(links);

    const now = new Date();
    await initializer.initJob({
      project,
      user: linksUser,
      org: links,
      execution_start: new Date(now.getTime() - 10000),
      execution_end: new Date(now.getTime() - 8000), // 2000ms, free queue
      usedReservation: false,
    });
    await initializer.initJob({
      project,
      user: linksUser,
      org: links,
      execution_start: new Date(now.getTime() - 7000),
      execution_end: new Date(now.getTime() + 3000), // 10000ms, reservation — must not count
      usedReservation: true,
    });

    const fetched = await repo.getOne(project.id);
    expect(Number(fetched?.total_freequeue_time)).toBe(2000);
  });

  it("should sum only free queue jobs when mixed with reservation jobs", async () => {
    const links = await initializer.initLinksOrganization();
    const linksUser = await initializer.initLinksUser();
    const project = await initializer.initFreeQueueProject(links);

    const now = new Date();
    await initializer.initJob({
      project,
      user: linksUser,
      org: links,
      execution_start: new Date(now.getTime() - 20000),
      execution_end: new Date(now.getTime() - 18000), // 2000ms, free queue
      usedReservation: false,
    });
    await initializer.initJob({
      project,
      user: linksUser,
      org: links,
      execution_start: new Date(now.getTime() - 17000),
      execution_end: new Date(now.getTime() - 12000), // 5000ms, reservation
      usedReservation: true,
    });
    await initializer.initJob({
      project,
      user: linksUser,
      org: links,
      execution_start: new Date(now.getTime() - 11000),
      execution_end: new Date(now.getTime() - 8000), // 3000ms, free queue
      usedReservation: false,
    });
    await initializer.initJob({
      project,
      user: linksUser,
      org: links,
      execution_start: new Date(now.getTime() - 7000),
      execution_end: new Date(now.getTime() - 3000), // 4000ms, reservation
      usedReservation: true,
    });

    const fetched = await repo.getOne(project.id);
    expect(Number(fetched?.total_freequeue_time)).toBe(5000); // 2000 + 3000
  });

  it("should return 0 as total_freequeue_time for non-free_queue project", async () => {
    const links = await initializer.initLinksOrganization();
    await initializer.initLinksUser();
    const project = await initializer.initNoFreeQueueProject(links);

    const fetched = await repo.getOne(project.id);
    expect(Number(fetched?.total_freequeue_time)).toBe(0);
  });
});
