import { NotificationsSkeleton } from "../_components/notifications-skeleton";

export default function NotificationPreferencesLoading() {
  return <NotificationsSkeleton rows={5} label="Loading notification preferences" />;
}
