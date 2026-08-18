/**
 * Phase 10: a tenant's standing customer-join link, as seen by its owning
 * Tenant Owner on the Customer Access settings page. `joinUrl` is built
 * server-side (never assembled from a raw token on the client) so the
 * customer-app origin stays a single, auditable configuration point.
 */
export interface JoinLinkDto {
  code: string;
  joinUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Phase 10: the public, pre-authentication preview shown when a customer
 * opens a join link/QR/code — deliberately minimal. Never includes the
 * organization's database id, member counts, or any other internal detail;
 * only what's needed to render "Join {organizationName}".
 */
export interface JoinPreviewDto {
  organizationName: string;
  joinToken: string;
}
