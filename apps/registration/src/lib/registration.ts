import 'server-only';
import * as db from './registration-db';
import * as api from './registration-api';

/**
 * Which back end this deployment uses.
 *
 * 'db' is the original direct database, which is what runs until the cutover;
 * 'api' is the IRCA API. Both speak the same functions, so switching over —
 * and back, if the Sunday goes wrong — is a redeploy rather than a code
 * change.
 */
const impl = process.env.REGISTRATION_BACKEND === 'api' ? api : db;

export const usingApi = impl === api;

export const { createRegistration, getByToken, setLanguage, submit } = impl;

/** Only the database back end has these: the API does the same work itself. */
export const { saveValues, listRegistrations, PhoneTakenError } = db;
export type { Registration } from '@irca/shared/registration';
