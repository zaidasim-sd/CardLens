import "dotenv/config";
import { createSheetGateway } from "../server/integrations/sheetService.js";

const gateway = createSheetGateway();
if (!gateway) throw new Error("Google Sheet service account configuration is required");
const result = await gateway.configure();
console.log(`Configured the register with ${result.visibleColumns} visible columns, ${result.columns - result.visibleColumns} hidden synchronization columns, and the review status dropdown.`);
