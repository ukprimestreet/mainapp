/**
 * Creates an administrator account from the server, for the first one — when there is nobody with
 * `admins.manage` yet to create it from the admin screens.
 *
 *   npm run admin:create -- --email=you@example.com --name="Your Name" --role=SUPER_ADMIN
 *   npm run admin:create -- --email=you@example.com --name="Your Name" --schema=public
 *
 * It never takes a password and never prints one. It creates the account with no password and a one-time
 * setup link, which the person follows to choose their own. That is also why there is no administrator
 * registration page anywhere on the site: an account can only come from here, or from somebody who already
 * has `admins.manage`.
 *
 * The link is printed to the terminal **once**. It is not emailed by default, because the first account is
 * usually created before mail is proven on a given environment; pass --email-link to send it as well.
 */
import { PrismaClient } from "@prisma/client";
import { createAdmin, isRole, type Role } from "../src/lib/admin-users";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const flag = (name: string) => process.argv.includes(`--${name}`);

const schema = arg("schema") ?? "dev";
if (schema !== "dev" && schema !== "public") throw new Error(`Unknown schema: ${schema}`);

const email = arg("email");
const name = arg("name");
const role = (arg("role") ?? "SUPER_ADMIN") as Role;

if (!email || !name) {
  console.error("Usage: npm run admin:create -- --email=you@example.com --name=\"Your Name\" [--role=SUPER_ADMIN|ADMIN] [--schema=dev|public] [--email-link]");
  process.exit(1);
}
if (!isRole(role)) {
  console.error(`Unknown role "${role}". Use SUPER_ADMIN or ADMIN.`);
  process.exit(1);
}

// The library talks to the default client, so point that at the chosen schema before importing anything
// that uses it. Doing it here keeps the script honest about which database it is writing to.
process.env.DATABASE_URL = (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${schema}`);

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

async function main() {
  const existing = await db.adminUser.count();
  const supers = await db.adminUser.count({ where: { role: "SUPER_ADMIN", active: true } });
  console.log(`${schema}: ${existing} administrator account(s), ${supers} active super admin(s)`);

  const created = await createAdmin({ email: email!, name: name!, role, createdBy: `create-admin script (${schema})` });
  if (created.error || !created.admin) {
    console.error(`\nNot created: ${created.error}`);
    process.exit(1);
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const link = `${base}/admin/setup/${created.token}`;

  console.log(`\nCreated ${created.admin.email} as ${created.admin.role}.`);
  console.log("\nSend them this link. It works once and expires in 48 hours:\n");
  console.log(`  ${link}\n`);
  console.log("No password was set and none was printed: they choose their own from that link.");

  if (flag("email-link")) {
    const { sendMail } = await import("../src/lib/mail");
    await sendMail(
      created.admin.email,
      "Your PrimeStreet administrator account",
      [`${created.admin.name},`, "", `An administrator account has been created for you with the role ${created.admin.role}.`,
       "", "Set your password with this link. It works once and expires in 48 hours.", link, "",
       "If you were not expecting this, say so immediately."].join("\n"),
      { purpose: "accounts" },
    );
    console.log(`\nAlso emailed to ${created.admin.email}.`);
  }

  if (existing === 0) {
    console.log("\nThis is the first account. Once its password is set, the shared ADMIN_PASSWORD login");
    console.log("stops working by itself — see docs/admin-accounts.md. Nothing else needs changing.");
  }

  await db.$disconnect();
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
