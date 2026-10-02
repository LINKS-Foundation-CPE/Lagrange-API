import * as userRepo from "../../src/repositories/user.repository";
import * as projectRepo from "../../src/repositories/project.repository";
import * as organizationRepo from "../../src/repositories/organization.repository";
import * as slotRepo from "../../src/repositories/slot.repository";
import * as reservationRepo from "../../src/repositories/reservation.repository";

import * as mockData from "./mockData";
import { Organization, User, Project, Slot, Job } from "../../src/models";
import { DateTime } from "luxon";

type InitUserParams = {
  default_project_id?: number | null;
  organization_manager?: boolean;
  organization_auditor?: boolean;
};

export default class dataInitializer {
  links: Organization;
  polito: Organization;
  linksUsers: User[] = [];
  politoUsers: User[] = [];

  initLinksOrganization = async (
    initialBudget: number = mockData.linksVault.remaining_budget,
  ): Promise<Organization> => {
    const linksOrganization = await organizationRepo.create(
      mockData.linksOrganization,
    );

    const linksVault = await projectRepo.create({
      ...mockData.linksVault,
      organization_id: linksOrganization.id,
      remaining_budget: initialBudget,
    });

    linksOrganization.vault_project_id = linksVault.id;
    await linksOrganization.save();

    this.links = linksOrganization;
    this.linksUsers = [];

    return linksOrganization;
  };

  initPolitoOrganization = async (
    initialBudget: number = mockData.politoVault.remaining_budget,
  ): Promise<Organization> => {
    const politoOrganization = await organizationRepo.create(
      mockData.politoOrganization,
    );

    const politoVault = await projectRepo.create({
      ...mockData.politoVault,
      organization_id: politoOrganization.id,
      remaining_budget: initialBudget,
    });

    politoOrganization.vault_project_id = politoVault.id;
    await politoOrganization.save();

    this.polito = politoOrganization;
    this.politoUsers = [];

    return politoOrganization;
  };

  initOrganization = async (
    name: string,
    parent_organization: number | null = null,
    initialBudget: number = 0,
  ): Promise<Organization> => {
    const organization = await organizationRepo.create({
      name,
      reference_organization_id: parent_organization,
    });

    const organizationVault = await projectRepo.create({
      name: `${name} vault`,
      free_queue: false,
      organization_id: organization.id,
      remaining_budget: initialBudget,
    });

    organization.vault_project_id = organizationVault.id;
    await organization.save();

    return organization;
  };

  initFreeQueueProject = async (org: Organization, budget: number = 0) => {
    const freeQueueProject = projectRepo.create({
      name: `${org.name} Free Queue Project ${Math.floor(Math.random() * 1000)}`,
      free_queue: true,
      remaining_budget: budget,
      organization_id: org.id,
    });
    return freeQueueProject;
  };

  initNoFreeQueueProject = async (org: Organization, budget: number = 0) => {
    const freeQueueProject = projectRepo.create({
      name: `${org.name} No Free Queue Project ${Math.floor(Math.random() * 1000)}`,
      free_queue: false,
      remaining_budget: budget,
      organization_id: org.id,
    });
    return freeQueueProject;
  };

  initExpiredProject = async (org: Organization, budget: number = 0) => {
    const now = DateTime.local();
    const end = now.minus({ days: 1 });

    const freeQueueProject = projectRepo.create({
      name: `${org.name} Expired Project ${Math.floor(Math.random() * 1000)}`,
      free_queue: false,
      remaining_budget: budget,
      organization_id: org.id,
      end_at: end.toJSDate(),
    });
    return freeQueueProject;
  };

  initNotStartedProject = async (org: Organization, budget: number = 0) => {
    const now = DateTime.local();
    const start = now.plus({ days: 1 });

    const freeQueueProject = projectRepo.create({
      name: `${org.name} Expired Project ${Math.floor(Math.random() * 1000)}`,
      free_queue: false,
      remaining_budget: budget,
      organization_id: org.id,
      start_at: start.toJSDate(),
    });
    return freeQueueProject;
  };

  getLinks = () => {
    if (this.links) return this.links;
    return this.initLinksOrganization();
  };

  getPolito = () => {
    if (this.polito) return this.polito;
    return this.initPolitoOrganization();
  };

  initLinksUser = async ({
    default_project_id = null,
    organization_manager = false,
    organization_auditor = false,
  }: InitUserParams = {}): Promise<User> => {
    try {
      const user = await userRepo.create({
        email: `user-${this.linksUsers.length + 1}@linksfoundatin.com`,
        sub: `links-${this.linksUsers.length + 1}`,
        organization_id: this.links.id,
        default_project_id,
        organization_manager,
        organization_auditor,
      });
      this.linksUsers.push(user);
      return user;
    } catch (err) {
      console.log(err);
      return this.linksUsers[0];
    }
  };

  initPolitoUser = async (): Promise<User> => {
    const user = await userRepo.create({
      email: `user-${this.politoUsers.length + 1}@polito.it`,
      sub: `polito-${this.politoUsers.length + 1}`,
      organization_id: this.polito.id,
    });
    this.politoUsers.push(user);
    return user;
  };

  initUser = async ({
    email = `user@organization.com`,
    sub = `user-sub`,
    organization_id = 0,
    default_project_id = null,
    organization_manager = false,
    organization_auditor = false,
  }): Promise<User> => {
    const user = await userRepo.create({
      email,
      sub,
      organization_id,
      default_project_id,
      organization_manager,
      organization_auditor,
    });

    return user;
  };

  addUserToProject = async (user: User, project: Project) => {
    return project.addUser(user);
  };

  addDefaultProjectToUser = async (user: User, project: Project) => {
    user.default_project_id = project.id;
    return user.save();
  };

  assignCurrentSlot = async (
    org: Organization,
    hoursBefore: number = 1,
    hoursAfter = 1,
  ) => {
    const now = DateTime.now(); //.local();

    // Format values for Sequelize model
    const day = now.toISODate(); // YYYY-MM-DD for DATEONLY
    const start = now.minus({ hours: hoursBefore }); //.toFormat("HH:mm:ss"); // TIME
    const end = now.plus({ hours: hoursAfter }); //.toFormat("HH:mm:ss"); // TIME

    const assignedSlot = await slotRepo.create({
      organization_id: org.id,
      day,
      start,
      end,
    });
    return assignedSlot;
  };

  initJob = async (params: {
    project: Project;
    user: User;
    org: Organization;
    execution_start?: Date | null;
    execution_end?: Date | null;
    usedReservation?: boolean;
  }) => {
    return Job.create({
      organization_id: params.org.id,
      project_id: params.project.id,
      user_id: params.user.id,
      jobid: `job-${Math.random().toString(36).slice(2)}`,
      usedReservation: params.usedReservation ?? false,
      execution_start: params.execution_start ?? null,
      execution_end: params.execution_end ?? null,
    });
  };

  addReservation = async (slot: Slot, project: Project, user: User) => {
    return reservationRepo.create({
      project_id: project.id,
      slot_id: slot.id,
      day: slot.day,
      start: slot.start,
      end: slot.end,
      made_by: user.id,
      description: null,
    });
  };
}
