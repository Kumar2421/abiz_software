/** Quick-insert bodies for the composer. Placeholders are resolved server-side
 *  for the welcome message; here they are filled from the loaded settings. */
export const messageTemplates = [
  {
    id: "shop-details",
    label: "Shop details",
    body: "📍 {{company_name}}\n{{address}}\n\n📞 {{phone}}\n🕘 Open Mon–Sat, 9:00 AM – 8:00 PM",
  },
  {
    id: "hours",
    label: "Business hours",
    body: "We are open Monday to Saturday, 9:00 AM to 8:00 PM. Closed on Sundays.",
  },
  {
    id: "thanks",
    label: "Thank you",
    body: "Thank you for reaching out to {{company_name}}! Let us know if you need anything else.",
  },
  {
    id: "followup",
    label: "Follow up",
    body: "Just following up on your enquiry. Is there anything else we can help you with?",
  },
];

export const DEFAULT_WELCOME = `Hi 👋

Thank you for contacting {{company_name}}. Contact {{phone}} if you need more details.

We have received your message and will reply as soon as possible.`;
