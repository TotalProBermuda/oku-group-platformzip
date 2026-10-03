import type { DefaultSession } from "next-auth";
import type { RoleKey } from "@/types/roles";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      id?: string;
      roles?: RoleKey[];
      passwordlessDestination?: string;
    };
  }
}
