import { Request, Response } from "express";
import * as userService from "../services/user.service.ts";

export const getRoles = async (req: Request, res: Response) => {
  const roles = await userService.getRolesByUsername(req.params.username);
  if (roles === null) {
    res.status(404).json({ message: "user not found" });
    return;
  }
  res.status(200).json({ username: req.params.username, roles });
};
