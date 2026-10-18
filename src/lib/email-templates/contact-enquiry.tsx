import React from 'react'
import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  email?: string
  company?: string
  phone?: string
  message?: string
}

const ContactEnquiry = ({ name, email, company, phone, message }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New ScanLoc8 enquiry from {name || 'a visitor'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New website enquiry</Heading>
        <Text style={muted}>Sent from the ScanLoc8 contact page.</Text>
        <Section style={card}>
          <Text style={row}><strong>Name:</strong> {name || '—'}</Text>
          <Text style={row}><strong>Email:</strong> {email || '—'}</Text>
          <Text style={row}><strong>Company:</strong> {company || '—'}</Text>
          <Text style={row}><strong>Phone:</strong> {phone || '—'}</Text>
        </Section>
        <Hr style={hr} />
        <Text style={label}>Message</Text>
        <Text style={body}>{message || '—'}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ContactEnquiry,
  subject: (d: Record<string, any>) => `ScanLoc8 enquiry from ${d['name'] || 'website visitor'}`,
  displayName: 'Contact enquiry',
  to: 'simon.barnsley@levata.com',
  previewData: { name: 'Alex Taylor', email: 'alex@example.com', company: 'North & Co.', phone: '07700 900123', message: 'We would like a demo for two receptions.' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '28px 25px', maxWidth: '560px' }
const h1 = { color: '#14532d', fontSize: '22px', margin: '0 0 6px' }
const muted = { color: '#6b7280', fontSize: '13px', margin: '0 0 18px' }
const card = { backgroundColor: '#f4f7f2', borderRadius: '8px', padding: '12px 16px' }
const row = { fontSize: '14px', color: '#111827', margin: '4px 0' }
const hr = { borderColor: '#e5e7eb', margin: '20px 0' }
const label = { fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' as const, margin: '0 0 6px' }
const body = { fontSize: '14px', color: '#111827', lineHeight: '22px', whiteSpace: 'pre-wrap' as const }
