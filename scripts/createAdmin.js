import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { logger } from '../src/utils/logger.js';

const passwordComplexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,100}$/;

async function promptForInput(promptText) {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(promptText);
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function createAdmin() {
  let email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  let password = process.env.ADMIN_PASSWORD;
  let firstName = process.env.ADMIN_FIRST_NAME?.trim() || 'Store';
  let lastName = process.env.ADMIN_LAST_NAME?.trim() || 'Administrator';

  // If credentials are not provided via environment variables, prompt in terminal
  if (!email && process.stdin.isTTY) {
    // eslint-disable-next-line no-console
    console.log('\n🔐 DripRack Administrator Setup\n');
    email = (await promptForInput('Enter Admin Email: ')).toLowerCase();
  }

  if (!password && process.stdin.isTTY) {
    password = await promptForInput('Enter Admin Password (min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special): ');
  }

  // Validate presence
  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.error('❌ Error: Both ADMIN_EMAIL and ADMIN_PASSWORD are required.');
    // eslint-disable-next-line no-console
    console.error('Usage via environment variables:');
    // eslint-disable-next-line no-console
    console.error('  ADMIN_EMAIL="admin@driprack.com" ADMIN_PASSWORD="StrongPassword123!" node scripts/createAdmin.js\n');
    process.exit(1);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    // eslint-disable-next-line no-console
    console.error('❌ Error: Invalid email address format.');
    process.exit(1);
  }

  // Validate password complexity
  if (!passwordComplexityRegex.test(password)) {
    // eslint-disable-next-line no-console
    console.error('❌ Error: Password must be 8-100 characters and contain at least one uppercase letter, one lowercase letter, one digit, and one special character.');
    process.exit(1);
  }

  try {
    await connectDB();

    // Check if user already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      if (existingUser.role === 'admin') {
        logger.info({ email }, 'Administrator account already exists. Setup is idempotent; no changes made.');
        // eslint-disable-next-line no-console
        console.log(`ℹ️  Administrator account already exists for ${email}. No changes made.`);
        await disconnectDB();
        process.exit(0);
      } else {
        // SECURITY SAFEGUARD: Never silently elevate an existing customer to administrator
        logger.error({ email, currentRole: existingUser.role }, 'Refusing to silently elevate customer to administrator');
        // eslint-disable-next-line no-console
        console.error(`❌ Security Violation: A user with email '${email}' exists with role '${existingUser.role}'.`);
        // eslint-disable-next-line no-console
        console.error('Silent role elevation is prohibited. Please use a distinct administrator email address.');
        await disconnectDB();
        process.exit(1);
      }
    }

    // Hash password with Argon2id
    const passwordHash = await User.hashPassword(password);

    // Create administrator account
    await User.create({
      email,
      passwordHash,
      firstName,
      lastName,
      role: 'admin',
      status: 'active'
    });

    logger.info({ email }, 'Initial administrator account created successfully');
    // eslint-disable-next-line no-console
    console.log(`\n✅ Initial administrator account created successfully for: ${email}\n`);

    await disconnectDB();
    process.exit(0);
  } catch (error) {
    logger.fatal({ err: error.message }, 'Failed to create administrator account');
    // eslint-disable-next-line no-console
    console.error('❌ Failed to create administrator account:', error.message);
    try {
      await disconnectDB();
    } catch {
      // Ignore disconnect error on failure
    }
    process.exit(1);
  }
}

createAdmin();
