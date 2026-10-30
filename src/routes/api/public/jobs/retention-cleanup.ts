import { createFileRoute } from '@tanstack/react-router'
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth'

// Cron-triggered daily: deletes data older than each company's retention settings.
// - Read alerts older than alert_retention_days (default 90)
// - RFID scan history older than scan_retention_days (default 365)
// - Reader debug logs older than 30 days (fixed, diagnostic only)
// Contact enquiries are emailed, never stored, so there is nothing to clean up.
export const Route = createFileRoute('/api/public/jobs/retention-cleanup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request)
        if (denied) return denied

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

        const { data: settings, error } = await supabaseAdmin
          .from('company_settings')
          .select('company_slug, scan_retention_days, alert_retention_days')
        if (error) return Response.json({ error: error.message }, { status: 500 })

        const results: Record<string, { alerts: number; scans: number; events: number }> = {}
        const failures: string[] = []

        for (const s of settings ?? []) {
          const alertDays = s.alert_retention_days ?? 90
          const scanDays = s.scan_retention_days ?? 365

          const alertCutoff = new Date(Date.now() - alertDays * 86400_000).toISOString()
          const scanCutoff = new Date(Date.now() - scanDays * 86400_000).toISOString()

          const { count: alerts, error: alertError } = await supabaseAdmin
            .from('alerts')
            .delete({ count: 'exact' })
            .eq('company_slug', s.company_slug)
            .not('read_at', 'is', null)
            .lt('created_at', alertCutoff)

          const { count: scans, error: scanError } = await supabaseAdmin
            .from('rfid_scans')
            .delete({ count: 'exact' })
            .eq('company_slug', s.company_slug)
            .lt('last_seen', scanCutoff)

          const { count: events, error: eventError } = await supabaseAdmin
            .from('scan_events')
            .delete({ count: 'exact' })
            .eq('company_slug', s.company_slug)
            .lt('recorded_at', scanCutoff)
          if (alertError || scanError || eventError) failures.push(s.company_slug)
          results[s.company_slug] = { alerts: alerts ?? 0, scans: scans ?? 0, events: events ?? 0 }
          const { error: auditError } = await supabaseAdmin.from('audit_log').insert({
            company_slug: s.company_slug,
            action: 'retention.cleanup',
            details: { ...results[s.company_slug], ok: !alertError && !scanError && !eventError },
          })
          if (auditError) failures.push(`${s.company_slug}: activity record failed`)
        }

        const debugCutoff = new Date(Date.now() - 30 * 86400_000).toISOString()
        const { count: debugLogs, error: debugError } = await supabaseAdmin
          .from('zebra_reader_debug_logs')
          .delete({ count: 'exact' })
          .lt('created_at', debugCutoff)

        if (debugError) failures.push('Reader diagnostic cleanup failed')
        return Response.json({ ok: failures.length === 0, companies: results, debugLogs: debugLogs ?? 0, failures }, { status: failures.length ? 500 : 200 })
      },
    },
  },
})
