export type Role = 'EMPLOYEE' | 'TEAM_LEADER' | 'REGIONAL_LEAD' | 'SYSTEM_ADMIN'
export interface Employee { id:string; display_name:string; position:string; monthly_units_target:number; weekly_revenue_target_cents:number|null }
export interface Me { id:string; email:string; full_name:string; role:Role; must_change_password:boolean; employee:Employee|null }
export interface Customer { id:string; employee_id:string; first_name:string; last_name:string; full_name:string; street:string; house_number:string; postal_code:string; city:string; phone:string|null; email:string|null; notes:string|null; created_at?:string; address:string }
export interface Product { id:string; name:string; category:string; description:string|null; functions:string[]; technical:Record<string,unknown>; variants:unknown[]; accessories:unknown[]; official_url:string|null; source_url:string|null; source_kind:string|null; source_updated_at:string|null; verified:boolean; price:{amount_cents:number;currency:string;source_url:string;fetched_at:string}|null; image:{url:string;alt_text:string|null;source_url:string;usage_note:string|null}|null }
export interface Appointment { id:string; customer_id:string|null; customer_name:string|null; employee_id:string; start_at:string; end_at:string|null; appointment_type:string; status:string; notes:string|null; address:string|null; phone:string|null; email:string|null; products:{id:string;name:string}[] }
export interface SaleItem { id?:string; product_id:string; name?:string; category?:string|null; is_k70?:boolean; quantity:number; unit_price_cents:number; total_cents?:number }
export interface Sale { id:string; customer_id:string; customer_name:string; employee_id:string; employee_name:string; appointment_id:string|null; sold_at:string; channel:string; notes:string|null; items:SaleItem[]; total_cents:number; k70_total_cents:number; product_total_cents:number; units:number; cancelled:boolean; cancelled_at:string|null; cancellation_reason:string|null; counts_total_cents:number; counts_units:number; counts_k70_cents:number }
export interface TradeIn { id:string; customer_id:string; customer_name:string; employee_id:string; sale_id:string|null; model:string; serial_number:string|null; condition:string; condition_label:string; status:string; status_label:string; received_on:string; notes:string|null; created_at:string }
export interface Rental { id:string; product_id:string; product_name:string|null; customer_id:string; customer_name:string|null; customer_phone:string|null; employee_id:string; serial_number:string|null; issued_at:string; due_at:string|null; returned_at:string|null; status:string; notes:string|null; is_overdue:boolean; due_soon:boolean; days_until_due:number|null; days_overdue:number }
export interface OfferItem { id?:string; product_id:string; name?:string; quantity:number; unit_price_cents:number; total_cents?:number }
export interface Offer {
  id:string; number:string; customer_id:string; customer_name:string; customer_address:string
  employee_id:string; employee_name:string; appointment_id:string|null
  status:'draft'|'sent'|'accepted'|'rejected'|'expired'|'converted'; status_label:string; stored_status:string
  issued_on:string; valid_until:string|null; discount_percent:number; notes:string|null
  created_at:string; updated_at:string; sent_at:string|null; accepted_at:string|null
  rejected_at:string|null; rejection_reason:string|null
  converted_sale_id:string|null; converted_at:string|null
  items:OfferItem[]; subtotal_cents:number; discount_cents:number; total_cents:number
  can_edit:boolean; can_delete:boolean; can_send:boolean; can_accept:boolean; can_reject:boolean; can_convert:boolean
}
export interface PipelineFollowUp { id:string; due_on:string; reason:string; note:string|null; days_until:number; is_overdue:boolean; is_today:boolean }
export interface PipelineAppointment { id:string; start_at:string; appointment_type:string }
export interface PipelineOffer { id:string; number:string; status:string; status_label:string; total_cents:number }
export interface PipelineSale { id:string; sold_at:string; total_cents:number }
export interface PipelineCard {
  customer_id:string; customer_name:string; customer_phone:string|null; customer_email:string|null; customer_city:string|null
  employee_id:string; employee_name:string
  team_id:string|null; team_name:string|null; district_id:string|null; district_name:string|null; region_id:string|null; region_name:string|null
  stage:string; stage_label:string
  last_contact_at:string
  next_action:string
  next_appointment:PipelineAppointment|null
  next_follow_up:PipelineFollowUp|null
  open_offer:PipelineOffer|null
  last_sale:PipelineSale|null
  potential_revenue_cents:number|null
}
export interface PipelineResponse { customers:PipelineCard[]; counts:Record<string,number> }
export interface OrgLookup {
  regions:{id:string; name:string}[]
  districts:{id:string; name:string; region_id:string}[]
  teams:{id:string; name:string; district_id:string}[]
}
