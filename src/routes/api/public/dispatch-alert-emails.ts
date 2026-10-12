import { createFileRoute } from '@tanstack/react-router'
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth'

// Cron-triggered: emails pending rule alerts that have "Also send email" on.
export const Route = createFileRoute('/api/public/dispatch-alert-emails')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request)
        if (denied) return denied

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { sendTemplateEmail } = await import('@/lib/email-templates/send-email')

        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
        const { data: alerts, error } = await supabaseAdmin
          .from('alerts')
          .select('id, rule_id, recipient_user_id, epc, location, message, created_at')
          .eq('notify_email', true)
          .is('emailed_at', null)
          .gte('created_at', since)
          .order('created_at', { ascending: true })
          .limit(50)
        if (error) return Response.json({ error: error.message }, { status: 500 })
        if (!alerts?.length) return Response.json({ sent: 0 })

        const userIds = [...new Set(alerts.map((a) => a.recipient_user_id))]
        const ruleIds = [...new Set(alerts.map((a) => a.rule_id).filter(Boolean))]
        const [{ data: profiles }, { data: rules }] = await Promise.all([
          supabaseAdmin.from('profiles').select('user_id, email').in('user_id', userIds),
          supabaseAdmin.from('alert_rules').select('id, name').in('id', ruleIds as string[]),
        ])
        const emailOf = new Map((profiles ?? []).map((p) => [p.user_id, p.email]))
        const ruleName = new Map((rules ?? []).map((r) => [r.id, r.name]))

        let sent = 0
        let failed = 0
        for (const a of alerts) {
          const to = emailOf.get(a.recipient_user_id)
          try {
            if (to) {
              const r = await sendTemplateEmail('rule-alert', to, {
                templateData: {
                  ruleName: a.rule_id ? ruleName.get(a.rule_id) : undefined,
                  message: a.message,
                  epc: a.epc,
                  location: a.location,
                  seenAt: new Date(a.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' }),
                },
                idempotencyKey: `rule-alert-${a.id}`,
              })
              if (r.sent) sent++
            }
            await supabaseAdmin.from('alerts').update({ emailed_at: new Date().toISOString() }).eq('id', a.id)
          } catch (e) {
            failed++
            console.error('rule-alert email failed', a.id, e)
            if ((e as any)?.status === 429) break
          }
        }
        return Response.json({ sent, failed })
      },
    },
  },
})
