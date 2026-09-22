export function formatPlanName(planType: string): string {
  const normalized = planType.trim().toLowerCase()
  if (/^pro[\s_-]*lite$/.test(normalized)) return 'Pro Lite'

  const knownNames: Record<string, string> = {
    plus: 'Plus',
    pro: 'Pro',
    free: 'Free',
    team: 'Team',
    business: 'Business',
    enterprise: 'Enterprise',
  }
  return knownNames[normalized] ?? planType.trim()
}
