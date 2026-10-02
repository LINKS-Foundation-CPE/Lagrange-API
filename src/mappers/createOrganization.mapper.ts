import { CreateOrganizationDto } from "../schemas/organization.schema.ts";
import { Organization } from "../models/index.ts";

export class OrganizationMapper {
  static toPersistence(dto: CreateOrganizationDto): Partial<Organization> {
    return {
      name: dto.name,
      reference_organization_id: dto.reference_organization_id ?? null,
    };
  }
}
