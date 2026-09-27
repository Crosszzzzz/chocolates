// M9 roles (adapted stack: Supabase Auth, no new backend).
// Single source for client-side role checks + Spanish labels.
// Server truth lives in public.profiles.role (002_roles.sql);
// the client learns it via GET/POST /api/me (service_role), never directly.
// Rollback: delete roles.ts + role usages; AuthContext falls back to Google-only.

export type UserRole = 'turista' | 'empresa' | 'admin';

export const ROLE_VALUES: readonly UserRole[] = ['turista', 'empresa', 'admin'];

export const DEFAULT_ROLE: UserRole = 'turista';

export const ROLE_LABEL_ES: Record<UserRole, string> = {
  turista: 'Turista',
  empresa: 'Empresa',
  admin: 'Administrador',
};

/** Normalize unknown input to a valid role; anything invalid => 'turista'. */
export function normalizeRole(value: unknown): UserRole {
  if (typeof value !== 'string') return DEFAULT_ROLE;
  const clean = value.trim().toLowerCase();
  return (ROLE_VALUES as readonly string[]).includes(clean) ? (clean as UserRole) : DEFAULT_ROLE;
}

export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}

export function isEmpresaRole(role: UserRole | null | undefined): boolean {
  return role === 'empresa';
}

export function isTuristaRole(role: UserRole | null | undefined): boolean {
  return role === 'turista';
}
