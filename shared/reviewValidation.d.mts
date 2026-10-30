export function followUpIssues(data: { followUpRequired?: string; nextAction?: string; followUpDate?: string }): { field: "nextAction" | "followUpDate"; message: string }[];
