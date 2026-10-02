import { ModelStatic, Sequelize, Transaction } from "sequelize";
import { TransactionManager } from "./TransactionManager.ts";

import {
  ActionLog,
  initActionLogModel,
  associateActionLogModel,
} from "./actionlog.ts";
import {
  Announcement,
  initAnnouncementModel,
  associateAnnouncementModel,
} from "./announcement.ts";
import {
  BudgetEvent,
  initBudgetEventModel,
  associateBudgetEventModel,
} from "./budgetEvent.ts";
import { Job, initJobModel, associateJobModel } from "./job.ts";
import {
  Notification,
  initNotificationModel,
  associateNotificationModel,
} from "./notification.ts";
import {
  Organization,
  initOrganizationModel,
  associateOrganizationModel,
} from "./organization.ts";
import {
  OrganizationRole,
  initOrganizationRoleModel,
  associateOrganizationRoleModel,
} from "./organizationRole.ts";
import { Project, initProjectModel, associateProjectModel } from "./project.ts";
import {
  ProjectUser,
  initProjectUserModel,
  associateProjectUserModel,
} from "./projectUser.ts";
import {
  Reservation,
  initReservationModel,
  associateReservationModel,
} from "./reservation.ts";
import { Slot, initSlotModel, associateSlotModel } from "./slot.ts";
import { SystemConfig, initSystemConfigModel } from "./systemConfig.ts";
import { Tag, initTagModel, associateTagModel } from "./tag.ts";
import { User, initUserModel, associateUserModel } from "./user.ts";

let transactionManager: TransactionManager;

export type Models = {
  ActionLog: ModelStatic<ActionLog>;
  Announcement: ModelStatic<Announcement>;
  BudgetEvent: ModelStatic<BudgetEvent>;
  Job: ModelStatic<Job>;
  Notification: ModelStatic<Notification>;
  Organization: ModelStatic<Organization>;
  OrganizationRole: ModelStatic<OrganizationRole>;
  Project: ModelStatic<Project>;
  ProjectUser: ModelStatic<ProjectUser>;
  Reservation: ModelStatic<Reservation>;
  Slot: ModelStatic<Slot>;
  SystemConfig: ModelStatic<SystemConfig>;
  Tag: ModelStatic<Tag>;
  User: ModelStatic<User>;
};

export function initModels(sequelize: Sequelize) {
  const models: Models = {
    ActionLog: initActionLogModel(sequelize),
    Announcement: initAnnouncementModel(sequelize),
    BudgetEvent: initBudgetEventModel(sequelize),
    Job: initJobModel(sequelize),
    Notification: initNotificationModel(sequelize),
    Organization: initOrganizationModel(sequelize),
    OrganizationRole: initOrganizationRoleModel(sequelize),
    Project: initProjectModel(sequelize),
    ProjectUser: initProjectUserModel(sequelize),
    Reservation: initReservationModel(sequelize),
    Slot: initSlotModel(sequelize),
    SystemConfig: initSystemConfigModel(sequelize),
    Tag: initTagModel(sequelize),
    User: initUserModel(sequelize),
  };

  // Define associations after all models are initialized
  associateActionLogModel(models);
  associateAnnouncementModel(models);
  associateBudgetEventModel(models);
  associateJobModel(models);
  associateNotificationModel(models);
  associateOrganizationModel(models);
  associateOrganizationRoleModel(models);
  associateProjectModel(models);
  associateProjectUserModel(models);
  associateReservationModel(models);
  associateSlotModel(models);
  associateTagModel(models);
  associateUserModel(models);

  transactionManager = new TransactionManager(sequelize);

  return models;
}

//const Announcement = initAnnouncementModel(sequelize);
//const Notification = initNotificationModel(sequelize);
//const ActionLog = initActionLogModel(sequelize)
//const BudgetEvent = initBudgetEventModel(sequelize)
//const Job = initJobModel(sequelize)
//const Organization = initOrganizationModel(sequelize)
//const Project = initProjectModel(sequelize)
//const ProjectUser = initProjectUserModel(sequelize)
//const Reservation = initReservationModel(sequelize)
//const Slot = initSlotModel(sequelize)
//const User = initUserModel(sequelize)

/*
OrganizationRole.belongsTo(User, { foreignKey: 'user_id' });
OrganizationRole.belongsTo(Role, { foreignKey: 'role_id' });
OrganizationRole.belongsTo(Organization, { foreignKey: 'organization_id' });

// User.js
User.belongsToMany(Role, {
  through: OrganizationRole,
  foreignKey: 'user_id',
  otherKey: 'role_id',
  as: 'rolesInOrganizations',
});

User.belongsToMany(Organization, {
  through: OrganizationRole,
  foreignKey: 'user_id',
  otherKey: 'organization_id',
  as: 'organizationsWithRoles',
});

// Role.js
Role.belongsToMany(User, {
  through: OrganizationRole,
  foreignKey: 'role_id',
  otherKey: 'user_id',
  as: 'usersWithRoles',
});

Role.belongsToMany(Organization, {
  through: OrganizationRole,
  foreignKey: 'role_id',
  otherKey: 'organization_id',
  as: 'organizationsWithRole',
});

// Organization.js
Organization.belongsToMany(User, {
  through: OrganizationRole,
  foreignKey: 'organization_id',
  otherKey: 'user_id',
  as: 'usersWithRoles',
});

Organization.belongsToMany(Role, {
  through: OrganizationRole,
  foreignKey: 'organization_id',
  otherKey: 'role_id',
  as: 'rolesAssigned',
});

  
  User.belongsToMany(Role, {
    through: 'project_roles',
    foreignKey: 'user_id',
    otherKey: 'role_id',
    as: 'projectRoles',
    timestamps: false,
  });

  
  Role.belongsToMany(User, {
    through: 'project_roles',
    foreignKey: 'role_id',
    otherKey: 'user_id',
    as: 'usersWithProjectRole',
  });

  User.belongsToMany(Role, {
    through: 'platform_roles',
    foreignKey: 'user_id',
    otherKey: 'role_id',
    as: 'platformRoles',
    timestamps: false,
  });
  
  Role.belongsToMany(User, {
    through: 'platform_roles',
    foreignKey: 'role_id',
    otherKey: 'user_id',
    as: 'usersWithPlatformRole',
  });
*/

export {
  ActionLog,
  Announcement,
  BudgetEvent,
  Job,
  Organization,
  OrganizationRole,
  Project,
  ProjectUser,
  Reservation,
  //Role,
  Slot,
  Tag,
  User,
  Notification,
  transactionManager,
  Transaction,
};
