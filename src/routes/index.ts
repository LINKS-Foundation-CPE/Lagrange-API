import activeAnnouncementsRouter from "./activeAnnouncement.routes.ts";
import announcementRoutes from "./announcement.routes.ts";
import budgetEventRouter from "./budgetEvent.routes.ts";
import jobRoutes from "./job.routes.ts";
import logRouter from "./log.routes.ts";
import metricsRoutes from "./metrics.routes.ts";
import notificationRoutes from "./notification.routes.ts";
import organizationRoutes from "./organization.routes.ts";
import projectRoutes from "./project.routes.ts";
import projectsUsersRoutes from "./projects_users.routes.ts";
import reportRoutes from "./report.routes.ts";
import reservationRoutes from "./reservation.routes.ts";
import slotRoutes from "./slot.routes.ts";
import tagRoutes from "./tag.routes.ts";
import userRoutes from "./user.routes.ts";
import userOwnRoutes from "./user_own.routes.ts";

import tokenRoutes from "./token.ts";
//import prjUsersRoutes from "./prjs_users";

export {
  userRoutes,
  userOwnRoutes,
  projectRoutes,
  organizationRoutes,
  slotRoutes,
  reservationRoutes,
  jobRoutes,
  tokenRoutes,
  //prjUsersRoutes,
  logRouter,
  budgetEventRouter,
  announcementRoutes,
  activeAnnouncementsRouter,
  notificationRoutes,
  projectsUsersRoutes,
  metricsRoutes,
  reportRoutes,
  tagRoutes,
};
