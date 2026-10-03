import { z } from "zod";

export const registrationSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().max(191).regex(/^[^\s@.]+(?:\.[^\s@.]+)*@[^\s@.]+(?:\.[^\s@.]+)+$/, "Adresse e-mail invalide.").transform((value) => value.toLowerCase()),
  phone: z.string().regex(/^\d{6,10}$/, "Le téléphone doit contenir de 6 à 10 chiffres."),
  password: z.string().min(10).max(72),
  captchaAnswer: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{5}$/),
});

export const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});
