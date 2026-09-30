import "dotenv/config";
import { createSheetGateway } from "../server/integrations/sheetService.js";

const gateway = createSheetGateway();
if (!gateway) throw new Error("Google Sheet service account configuration is required");
const result = await gateway.configure();
console.log(`Configured the protected test Sheet with ${result.columns} columns and the approved status dropdown.`);
