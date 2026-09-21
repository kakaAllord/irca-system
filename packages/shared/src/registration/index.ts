/**
 * The registration form's own rules: the questions, their three languages,
 * the branching, the validation, the dial codes and the insights drawn from
 * the answers.
 *
 * It lives here because three things need the same copy: the form the visitor
 * fills in, the API that stores the answers, and the Membership portal that
 * reads them. Imported as `@irca/shared/registration`, so the staff portal
 * does not carry the phone-number library it never uses.
 */
export * from './flow';
export * from './validate';
export * from './dialCodes';
export * from './insights';
export * from './types';
