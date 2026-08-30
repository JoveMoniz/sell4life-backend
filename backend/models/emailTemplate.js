import mongoose from 'mongoose';

// Structured (not raw-HTML) editable content for the marketing emails —
// subject/heading/body/CTA as plain fields rather than a free-text HTML
// editor, so an admin edit can't accidentally break the email's markup.
// {{name}} in heading/body is substituted with the recipient's (title-
// cased) name at send time — see utils/email.js renderMarketingEmail().
const emailTemplateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      enum: ['welcome', 'seller_invite'],
      required: true,
      unique: true,
    },
    subject:  { type: String, required: true },
    heading:  { type: String, required: true },
    body:     { type: String, required: true }, // \n\n = paragraph break
    ctaText:  { type: String, default: '' },
    ctaUrl:   { type: String, default: '' }, // relative path, e.g. /shop/
  },
  { timestamps: true }
);

const EmailTemplate = mongoose.models.EmailTemplate || mongoose.model('EmailTemplate', emailTemplateSchema);
export default EmailTemplate;

const DEFAULTS = {
  welcome: {
    subject: 'Welcome to Sell4Life!',
    heading: 'Welcome, {{name}}! 🎉',
    body: "Thanks for joining Sell4Life — we're glad you're here. We're an early, growing marketplace of independent sellers across the UK — browse what's listed, message sellers directly with questions, and even make an offer on selected listings.",
    ctaText: 'Start Browsing',
    ctaUrl: '/shop/',
  },
  seller_invite: {
    subject: 'Got something sitting around? Sell it for free on Sell4Life',
    heading: 'Turn clutter into cash',
    body: "Hi {{name}}, quick thought — if you've got anything sitting around unused (old electronics, clothes, furniture, whatever), you can list it on Sell4Life in a couple of minutes with a free Casual seller account. No monthly fees, no upfront cost — you only pay when it sells.\n\nWe're also running a Founding Seller promotion right now — early sellers get a limited number of sales completely free of platform commission.",
    ctaText: "Start Selling — It's Free",
    ctaUrl: '/sell/',
  },
};

// Returns the template for `key`, creating it from DEFAULTS if it doesn't
// exist yet — same "seed on first read" pattern as getPlatformConfig().
export async function getEmailTemplate(key) {
  let tpl = await EmailTemplate.findOne({ key }).lean();
  if (!tpl) {
    tpl = await EmailTemplate.create({ key, ...DEFAULTS[key] });
    tpl = tpl.toObject();
  }
  return tpl;
}

export { DEFAULTS as EMAIL_TEMPLATE_DEFAULTS };
