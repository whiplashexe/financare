import { findOwnedTemplate } from "../../utils/template.util.js";

export const getTemplate = async ({
  userId,
  templateId,
}: {
  userId: string;
  templateId: string;
}) => findOwnedTemplate(userId, templateId);
