import { z } from "zod";

export const creatAnnouncementSchema = z.object({
  start: z.iso.datetime().nullish(),
  end: z.iso.datetime().nullish(),
  title: z.string().min(3),
  description: z.string().min(3),
});

export const updateAnnouncementSchema = creatAnnouncementSchema; //.partial();

export type CreateAnnouncementDto = z.infer<typeof creatAnnouncementSchema>;
export type UpdateAnnouncementDto = z.infer<typeof updateAnnouncementSchema>;
