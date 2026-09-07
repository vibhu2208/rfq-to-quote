import "dotenv/config";
import { pollGmailInbox } from "../src/lib/gmail-imap";

async function main() {
  const includeExisting = process.argv.includes("--include-existing");
  const limitArg = process.argv.find((arg) => /^\d+$/.test(arg));
  const limit = Number(limitArg || 20);
  console.log(
    `Polling Gmail inbox (limit ${limit}, include existing unread: ${includeExisting})…`
  );
  const result = await pollGmailInbox({ limit, includeExisting });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
