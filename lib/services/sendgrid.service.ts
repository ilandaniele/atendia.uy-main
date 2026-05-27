import sgMail from "@sendgrid/mail";

export interface SendGridServiceConfig {
    apiKey: string;
}

interface DefaultInput {
    to: string;
    from: string;
}

interface SendWithTemplateInput extends DefaultInput {
    templateId: string;
    dynamicTemplateData: Record<string, any>;
}

interface SendInput extends DefaultInput {
    subject: string;
    text: string;
    html: string;
}

export class SendGridService {
    constructor(config: SendGridServiceConfig) {
        sgMail.setApiKey(config.apiKey);
    }

    async send(message: SendInput | SendWithTemplateInput) {
        return sgMail.send(message)
    }
}