import "dotenv/config";
import { setServers } from "node:dns";

// Match the existing backend DNS configuration for Atlas integration tests.
const servers = process.env.MONGODB_DNS_SERVERS?.split(",").map(value => value.trim()).filter(Boolean);
if (servers?.length) setServers(servers);
