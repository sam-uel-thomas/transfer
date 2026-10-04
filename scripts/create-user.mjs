// @ts-check
/**
 * Creates the uploader's account, or sets a new password if it already
 * exists. This is the only way an account is made: the app has no sign-up
 * page and sends no sign-in emails.
 *
 *   npm run create-user
 *
 * Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ALLOWED_EMAIL from
 * .env.local. The password is typed at a hidden prompt, never passed as an
 * argument, so it does not end up in your shell history.
 */
import { createClient } from "@supabase/supabase-js";

const MIN_PASSWORD_LENGTH = 12;

/** @param {string} name */
function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Fill it in .env.local first (see SETUP.md).`);
    process.exit(1);
  }
  return value;
}

/** Input that arrived after the Enter of one prompt, kept for the next. */
let leftover = "";

/**
 * Prompt without echoing what is typed.
 * @param {string} question
 * @returns {Promise<string>}
 */
function askHidden(question) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    console.error("Run this in an interactive terminal so the password can be typed.");
    process.exit(1);
  }

  return new Promise((resolve) => {
    let value = "";
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
    };

    /** @param {string} chunk */
    function onData(chunk) {
      const chars = Array.from(chunk);
      for (let index = 0; index < chars.length; index++) {
        const char = chars[index];
        if (char === "\r" || char === "\n" || char === "\u0004") {
          leftover = chars.slice(index + 1).join("");
          finish();
          return resolve(value);
        }
        if (char === "\u0003") {
          finish();
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    }

    stdin.on("data", onData);
    if (leftover) {
      const buffered = leftover;
      leftover = "";
      onData(buffered);
    }
  });
}

/**
 * The admin API has no lookup by email, so page through the users.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} email
 */
async function findUser(supabase, email) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match || data.users.length < 200) return match ?? null;
  }
}

const email = required("ALLOWED_EMAIL").trim().toLowerCase();
const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`Account: ${email}`);
const password = await askHidden(`Password (at least ${MIN_PASSWORD_LENGTH} characters): `);
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Too short. Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}
if ((await askHidden("Repeat password: ")) !== password) {
  console.error("The two passwords do not match. Nothing was changed.");
  process.exit(1);
}

try {
  const existing = await findUser(supabase, email);
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (error) throw error;
    console.log("Password updated. Sign in at /login.");
  } else {
    // email_confirm marks the address verified, so no confirmation email is needed.
    const { error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    console.log("Account created. Sign in at /login.");
  }
} catch (error) {
  console.error(`Supabase refused: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
