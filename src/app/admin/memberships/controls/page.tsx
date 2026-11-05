import { requireMembershipControlAccess } from "@/server/membership/requireControlAccess";
import MembershipControls from "./MembershipControls";

export default async function MembershipControlsPage() {
  await requireMembershipControlAccess();
  return <MembershipControls />;
}
