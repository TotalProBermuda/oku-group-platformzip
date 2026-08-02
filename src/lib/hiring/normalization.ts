export function normalizeSubmission(answers: Record<string, unknown>) {
  return {
    fullName: typeof answers.full_name === "string" ? answers.full_name : null,
    email: typeof answers.email === "string" ? answers.email : null,
    phone: typeof answers.phone === "string" ? answers.phone : null,
    authorizedToWorkInPanama:
      answers.authorized_to_work_in_panama === "yes"
        ? true
        : answers.authorized_to_work_in_panama === "no"
        ? false
        : null,
    workPermitStatus:
      typeof answers.work_permit_status === "string" ? answers.work_permit_status : null,
    shiftPreference: Array.isArray(answers.shift_preference)
      ? answers.shift_preference
      : [],
  };
}
