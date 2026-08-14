/**
 * Phase 5: controlled category values for a feedback form. Kept as a fixed
 * set (rather than a free-text tenant-defined list) per the assignment's
 * "use controlled values rather than accepting arbitrary unvalidated
 * category strings" guidance — this is the minimal implementation that
 * still lets a Tenant Owner classify a form meaningfully.
 */
export const FEEDBACK_CATEGORIES = {
  SUPPORT: 'SUPPORT',
  PRODUCT: 'PRODUCT',
  SERVICE: 'SERVICE',
  GENERAL: 'GENERAL',
  OTHER: 'OTHER',
} as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[keyof typeof FEEDBACK_CATEGORIES];

export const DEFAULT_FEEDBACK_CATEGORY: FeedbackCategory = FEEDBACK_CATEGORIES.GENERAL;

/**
 * A form starts INACTIVE so a Tenant Owner can build out its questions
 * before customers can see or submit to it, then explicitly activates it.
 */
export const FEEDBACK_FORM_STATUSES = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type FeedbackFormStatus = (typeof FEEDBACK_FORM_STATUSES)[keyof typeof FEEDBACK_FORM_STATUSES];

/** Phase 5 supports the two question types the assignment requires; no free-form config beyond what each type needs. */
export const FEEDBACK_QUESTION_TYPES = {
  RATING: 'RATING',
  TEXT: 'TEXT',
} as const;

export type FeedbackQuestionType = (typeof FEEDBACK_QUESTION_TYPES)[keyof typeof FEEDBACK_QUESTION_TYPES];

export const FEEDBACK_RATING_MIN = 1;
export const FEEDBACK_RATING_MAX = 5;

/** Default cap for a TEXT answer when the question doesn't specify its own `maxLength`. */
export const FEEDBACK_DEFAULT_TEXT_MAX_LENGTH = 2000;
/** Upper bound a question's own `maxLength` may not exceed, so a form can't be configured to accept unbounded payloads. */
export const FEEDBACK_TEXT_MAX_LENGTH_CEILING = 5000;

export const FEEDBACK_FORM_TITLE_MAX_LENGTH = 200;
export const FEEDBACK_FORM_DESCRIPTION_MAX_LENGTH = 2000;
export const FEEDBACK_QUESTION_LABEL_MAX_LENGTH = 300;

export const FEEDBACK_MIN_PAGE_SIZE = 1;
export const FEEDBACK_MAX_PAGE_SIZE = 100;
export const FEEDBACK_DEFAULT_PAGE_SIZE = 20;
