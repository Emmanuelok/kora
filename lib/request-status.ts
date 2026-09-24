export const requestStatuses = ['Request received', 'In review', 'Awaiting details', 'Quotation ready', 'Completed', 'Closed'] as const;
export type RequestStatus = typeof requestStatuses[number];
export const requestKinds = ['quote', 'service', 'trade-in', 'return', 'business', 'contact'] as const;
export const requestKindLabels: Record<string, string> = { quote: 'Product quotation', service: 'Service enquiry', 'trade-in': 'Trade-in assessment', return: 'Returns & warranty', business: 'Business enquiry', contact: 'Contact enquiry' };
