import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  ruleName?: string
  message?: string
  epc?: string
  location?: string
  seenAt?: string
}

const RuleAlertEmail = ({ ruleName, message, epc, location, seenAt }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{message || 'A ScanLoc8 rule was triggered'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>ScanLoc8</Text>
        <Heading style={h1}>Rule triggered{ruleName ? `: ${ruleName}` : ''}</Heading>
        <Text style={text}>{message || 'A tag matched one of your alert rules.'}</Text>
        <Section style={box}>
          {location ? <Text style={row}><b>Location:</b> {location}</Text> : null}
          {epc ? <Text style={row}><b>Tag:</b> <span style={mono}>{epc}</span></Text> : null}
          {seenAt ? <Text style={row}><b>Time:</b> {seenAt}</Text> : null}
        </Section>
        <Text style={muted}>You receive this because you are a recipient of this rule in ScanLoc8.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: RuleAlertEmail,
  subject: (d: Record<string, any>) => `ScanLoc8 alert: ${d.ruleName || 'Rule triggered'}`,
  displayName: 'Rule alert',
  previewData: {
    ruleName: 'Pallet at dispatch',
    message: 'Pallet at dispatch: Tag 3039ABC seen at Dispatch Bay',
    epc: '3039ABC0001',
    location: 'Dispatch Bay',
    seenAt: '12 Oct 2026, 18:30',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const brand = { color: '#0f766e', fontWeight: 700, fontSize: '14px', letterSpacing: '1px', margin: '0 0 12px' }
const h1 = { fontSize: '20px', color: '#0f172a', margin: '0 0 12px' }
const text = { fontSize: '15px', color: '#334155', lineHeight: '22px' }
const box = { backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '8px 16px', margin: '16px 0' }
const row = { fontSize: '14px', color: '#0f172a', margin: '6px 0' }
const mono = { fontFamily: 'monospace' }
const muted = { fontSize: '12px', color: '#64748b' }
