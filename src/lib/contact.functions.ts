import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(100),
  email: z.string().trim().email("Please enter a valid email").max(255),
  company: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().min(1, "Please enter a message").max(2000),
  website: z.string().max(0).optional().default(""), // honeypot
});

export const sendContactEnquiry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => contactSchema.parse(input))
  .handler(async ({ data }) => {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const id = crypto.randomUUID();
    await sendTemplateEmail("contact-enquiry", "simon.barnsley@levata.com", {
      templateData: { name: data.name, email: data.email, company: data.company, phone: data.phone, message: data.message },
      idempotencyKey: `contact-enquiry-${id}`,
    });
    return { ok: true };
  });
