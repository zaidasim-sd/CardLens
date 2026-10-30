export function followUpIssues(data) {
  if (data?.followUpRequired !== "Yes") return [];
  const issues = [];
  if (!String(data.nextAction || "").trim()) issues.push({ field: "nextAction", message: "Select a next action when follow-up is required." });
  if (!String(data.followUpDate || "").trim()) issues.push({ field: "followUpDate", message: "Choose a follow-up due date." });
  return issues;
}
