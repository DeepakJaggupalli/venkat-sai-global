import "server-only";

import { tasks as analyticsTasks } from "@/modules/analytics/tasks";
import { tasks as candidatesTasks } from "@/modules/candidates/tasks";
import { tasks as commercialTasks } from "@/modules/commercial/tasks";
import { tasks as contentTasks } from "@/modules/content/tasks";
import { tasks as filesTasks } from "@/modules/files/tasks";
import { tasks as identityTasks } from "@/modules/identity/tasks";
import { tasks as jobsTasks } from "@/modules/jobs/tasks";
import { tasks as notificationsTasks } from "@/modules/notifications/tasks";
import { tasks as operationsTasks } from "@/modules/operations/tasks";
import { tasks as organizationsTasks } from "@/modules/organizations/tasks";
import { tasks as privacyTasks } from "@/modules/privacy/tasks";
import { tasks as recruitmentTasks } from "@/modules/recruitment/tasks";
import { tasks as trainingTasks } from "@/modules/training/tasks";

import { tasks as systemTasks } from "./system-tasks";
import type { TaskHandlers } from "./types";

/** Every background task handler, keyed by task type. */
export const taskHandlers: TaskHandlers = {
  ...systemTasks,
  ...identityTasks,
  ...organizationsTasks,
  ...candidatesTasks,
  ...jobsTasks,
  ...recruitmentTasks,
  ...trainingTasks,
  ...operationsTasks,
  ...commercialTasks,
  ...notificationsTasks,
  ...contentTasks,
  ...analyticsTasks,
  ...privacyTasks,
  ...filesTasks,
};
