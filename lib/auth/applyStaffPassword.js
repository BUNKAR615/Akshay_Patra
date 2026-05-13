import bcrypt from "bcryptjs";
import { defaultPasswordFor } from "./defaultPassword.js";

const SALT_ROUNDS = 10;

/**
 * Hash the staff default password ("Firstname_##") for a user.
 *
 * Used by every staff-assignment endpoint (BM/CM/HR/Committee) to enforce
 * the policy: every successful assignment resets the user's password to the
 * formula. Admins can override by passing an explicit `data.password` from
 * the request body.
 *
 * The formula:
 *   Firstname_capitalized + "_" + last 2 digits of empCode
 *   "Rajesh Kumar Sharma" + "1800012" → "Rajesh_12"
 *
 * @param {object} args
 * @param {string} args.role     "BRANCH_MANAGER" | "CLUSTER_MANAGER" | "HR" | "COMMITTEE"
 * @param {string} args.empCode  user's empCode
 * @param {string} args.name     user's full name
 * @param {string} [args.override]  explicit plaintext password (admin-supplied) that wins over the formula
 * @returns {Promise<string>}    bcrypt hash ready to store in User.password
 */
export async function hashStaffDefaultPassword({ role, empCode, name, override }) {
    const plain = override || defaultPasswordFor({ role, empCode, name });
    return bcrypt.hash(plain, SALT_ROUNDS);
}

export default hashStaffDefaultPassword;
