import { autexaFetch } from './autexaServer';

export type ServiceTypeSchemaRow = {
  service_type: string;
  display_name: string;
  description: string | null;
  metadata_schema: { fields?: unknown[] };
  booking_fields: { required?: string[]; optional?: string[] };
};

export async function listServiceTypeSchemas(): Promise<{ types: ServiceTypeSchemaRow[] }> {
  return autexaFetch('/api/services/types', { method: 'GET' });
}

export async function createServiceTypeSchema(body: {
  service_type: string;
  display_name: string;
  description?: string;
  metadata_schema?: Record<string, unknown>;
  booking_fields?: Record<string, unknown>;
}): Promise<ServiceTypeSchemaRow> {
  return autexaFetch('/api/services/types', { method: 'POST', json: body });
}
