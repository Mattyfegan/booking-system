import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";
// Explicit React import: the test runner uses the classic JSX transform, which needs React in scope.
import React, { type ReactElement, type ReactNode } from "react";

// React Email templates for booking notifications. Sent via Resend (see lib/notifications.ts).
// Keep these inline-styled: email clients ignore stylesheets and Tailwind classes.

export type BookingEmailDetails = {
  businessName: string;
  customerName: string;
  serviceName: string;
  day: string;
  time: string;
  durationMin: number;
  priceLabel: string;
  bookingId: string;
  // Public base URL (no trailing slash), used for the "manage bookings" link.
  appUrl: string;
};

type Audience = "customer" | "owner";

const styles = {
  body: { backgroundColor: "#f6f6f4", fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" },
  container: { backgroundColor: "#ffffff", borderRadius: "8px", padding: "32px", maxWidth: "520px", margin: "0 auto" },
  heading: { fontSize: "22px", color: "#1a1a1a", margin: "0 0 16px" },
  text: { fontSize: "15px", color: "#333333", lineHeight: "1.5", margin: "0 0 12px" },
  detailLabel: { fontSize: "13px", color: "#777777", margin: "0" },
  detailValue: { fontSize: "15px", color: "#1a1a1a", margin: "0 0 10px" },
  hr: { borderColor: "#e5e5e5", margin: "20px 0" },
  footer: { fontSize: "12px", color: "#888888", margin: "0" },
};

function Layout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>{children}</Container>
      </Body>
    </Html>
  );
}

function Details({ d }: { d: BookingEmailDetails }) {
  const rows: [string, string][] = [
    ["Service", d.serviceName],
    ["Date", d.day],
    ["Time", d.time],
    ["Duration", `${d.durationMin} min`],
    ["Price", d.priceLabel],
    ["Customer", d.customerName],
  ];
  return (
    <Section>
      {rows.map(([label, value]) => (
        <div key={label}>
          <Text style={styles.detailLabel}>{label}</Text>
          <Text style={styles.detailValue}>{value}</Text>
        </div>
      ))}
    </Section>
  );
}

function Footer({ d }: { d: BookingEmailDetails }) {
  return (
    <>
      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        {d.businessName} - booking ref {d.bookingId}
      </Text>
    </>
  );
}

export function BookingConfirmationEmail({
  audience,
  ...d
}: BookingEmailDetails & { audience: Audience }): ReactElement {
  const isOwner = audience === "owner";
  const heading = isOwner ? "New booking" : "Your booking is confirmed";
  return (
    <Layout preview={`${heading}: ${d.serviceName} on ${d.day} at ${d.time}`}>
      <Heading style={styles.heading}>{heading}</Heading>
      <Text style={styles.text}>
        {isOwner ? `${d.customerName} has booked an appointment.` : `Hi ${d.customerName}, see you at ${d.businessName}.`}
      </Text>
      <Details d={d} />
      {!isOwner && (
        <Text style={styles.text}>
          Need to change plans? Cancel from{" "}
          <Link href={`${d.appUrl}/my-bookings`}>My bookings</Link>.
        </Text>
      )}
      <Footer d={d} />
    </Layout>
  );
}

export function BookingCancellationEmail({
  audience,
  ...d
}: BookingEmailDetails & { audience: Audience }): ReactElement {
  const isOwner = audience === "owner";
  const heading = isOwner ? "Booking cancelled" : "Your booking was cancelled";
  return (
    <Layout preview={`${heading}: ${d.serviceName} on ${d.day} at ${d.time}`}>
      <Heading style={styles.heading}>{heading}</Heading>
      <Text style={styles.text}>
        {isOwner
          ? `${d.customerName} cancelled this appointment. The slot is now free.`
          : `Hi ${d.customerName}, this appointment at ${d.businessName} has been cancelled.`}
      </Text>
      <Details d={d} />
      {!isOwner && (
        <Text style={styles.text}>
          To book again, visit <Link href={d.appUrl}>{d.appUrl}</Link>.
        </Text>
      )}
      <Footer d={d} />
    </Layout>
  );
}

export function BookingReminderEmail(d: BookingEmailDetails): ReactElement {
  return (
    <Layout preview={`Reminder: ${d.serviceName} tomorrow at ${d.time}`}>
      <Heading style={styles.heading}>Appointment reminder</Heading>
      <Text style={styles.text}>
        Hi {d.customerName}, a reminder of your appointment at {d.businessName} in the next 24 hours.
      </Text>
      <Details d={d} />
      <Text style={styles.text}>
        Can&apos;t make it? Cancel from <Link href={`${d.appUrl}/my-bookings`}>My bookings</Link>.
      </Text>
      <Footer d={d} />
    </Layout>
  );
}
