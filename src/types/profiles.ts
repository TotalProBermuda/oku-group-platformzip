export type UnifiedProfile = {
  id: string;
  sourceType: "USER" | "REFERRER" | "ENTITY";
  sourceId: string;
  profileType: "PERSON" | "COMPANY";
  displayName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  logoUrl: string | null;
  primaryCategory: string;
  categories: string[];
  roles: string[];
  status: string;
  hasAccess: boolean;
  compensationEligible: boolean;
  publicVisible: boolean;
  assignableToSeries: boolean;
  organizationName: string | null;
  referralCode: string | null;
  companyParent: string | null;
  createdAt: string;
  membershipTier: string | null;
  membershipStatus: string | null;
  influencerRefCode: string | null;
  influencerHandle: string | null;
  referrerType?: string;
  _count: {
    accountLinks: number;
    seriesAssignments: number;
    sessionAssignments: number;
    childRelationships: number;
  };
  accountLinks: {
    id: string;
    relationshipType: string;
    isPrimary: boolean;
    user: { id: string; email: string; status: string; name?: string };
  }[];
  parentRelationships: {
    relationshipType: string;
    parentProfile: { id: string; displayName: string; profileType: string };
  }[];
};
