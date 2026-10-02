import { z } from "zod";

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(128),
});

export const signupSchema = z
  .object({
    email: z.email().trim().toLowerCase(),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords do not match.",
  });
