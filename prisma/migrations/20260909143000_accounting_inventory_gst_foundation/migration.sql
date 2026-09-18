-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'UNDER_NEGOTIATION', 'REVISED', 'ACCEPTED', 'REJECTED', 'INVOICE_GENERATED', 'PAYMENT_PENDING', 'PAYMENT_RECEIVED', 'DELIVERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RfqChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'WEB_FORM', 'MARKETPLACE', 'MANUAL');

-- CreateEnum
CREATE TYPE "RfqStatus" AS ENUM ('NEW', 'NEEDS_REVIEW', 'PARSED', 'QUOTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "VendorPreferredChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "VendorOutreachStatus" AS ENUM ('PENDING', 'SENT', 'REPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "QuoteReplyIntent" AS ENUM ('ACCEPT', 'REJECT', 'QUESTION', 'COUNTER_OFFER', 'REQUEST_REVISION', 'ACKNOWLEDGEMENT', 'UNCLEAR');

-- CreateEnum
CREATE TYPE "OrganisationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LegalEntityType" AS ENUM ('PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'TRUST', 'SOCIETY', 'OTHER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "FiscalPeriodStatus" AS ENUM ('OPEN', 'SOFT_CLOSED', 'CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('QUOTATION', 'PROFORMA_INVOICE', 'TAX_INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'PAYMENT_RECEIPT', 'JOURNAL_VOUCHER', 'E_WAY_BILL');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('CUSTOMER', 'VENDOR', 'BOTH', 'EMPLOYEE', 'GOVERNMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('BILLING', 'SHIPPING', 'REGISTERED', 'WAREHOUSE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('GOODS', 'SERVICE');

-- CreateEnum
CREATE TYPE "UqcCode" AS ENUM ('BAG', 'BAL', 'BDL', 'BKL', 'BOU', 'BOX', 'BTL', 'BUN', 'CAN', 'CBM', 'CCM', 'CMS', 'CTN', 'DOZ', 'DRM', 'GGR', 'GMS', 'GRS', 'GYD', 'KGS', 'KLR', 'KME', 'LTR', 'MLT', 'MTR', 'MTS', 'NOS', 'PAC', 'PCS', 'PRS', 'QTL', 'ROL', 'SET', 'SQF', 'SQM', 'SQY', 'TBS', 'TGM', 'THD', 'TON', 'TUB', 'UGS', 'UNT', 'YDS', 'OTH');

-- CreateEnum
CREATE TYPE "SourceDocumentType" AS ENUM ('RFQ', 'PURCHASE_ORDER', 'SALES_ORDER', 'PROFORMA_INVOICE', 'TAX_INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'BANK_STATEMENT', 'PAYMENT_ADVICE', 'GST_RETURN', 'OTHER');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'NEEDS_REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'VALIDATING', 'NEEDS_REVIEW', 'VALID', 'POSTED', 'REJECTED', 'VOID');

-- CreateEnum
CREATE TYPE "ValidationSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'VOID');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING', 'PURCHASE', 'SALE', 'SALE_RETURN', 'PURCHASE_RETURN', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

-- CreateEnum
CREATE TYPE "InventoryValuationMethod" AS ENUM ('WEIGHTED_AVERAGE');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('RECEIPT', 'PAYMENT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'DEMAND_DRAFT', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('DRAFT', 'PENDING', 'CLEARED', 'BOUNCED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GstReturnType" AS ENUM ('GSTR1', 'GSTR3B', 'GSTR9', 'GSTR9C');

-- CreateEnum
CREATE TYPE "GstRecordStatus" AS ENUM ('DRAFT', 'PREPARED', 'VALIDATED', 'FILED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "GstReconciliationStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'PARTIAL', 'MISMATCH', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ExternalRecordStatus" AS ENUM ('PENDING', 'GENERATED', 'CANCELLED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "uqc" "UqcCode" NOT NULL DEFAULT 'NOS',
    "hsnCode" TEXT,
    "productType" "ProductType" NOT NULL DEFAULT 'GOODS',
    "organisationId" TEXT,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "offerPrice" DECIMAL(12,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "taxCategory" TEXT NOT NULL DEFAULT 'GST18',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rfq" (
    "id" TEXT NOT NULL,
    "channel" "RfqChannel" NOT NULL,
    "sourceRef" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "rawText" TEXT NOT NULL DEFAULT '',
    "rawAttachments" JSONB NOT NULL DEFAULT '[]',
    "customerName" TEXT NOT NULL DEFAULT '',
    "customerPhone" TEXT NOT NULL DEFAULT '',
    "customerEmail" TEXT NOT NULL DEFAULT '',
    "customerCompany" TEXT NOT NULL DEFAULT '',
    "status" "RfqStatus" NOT NULL DEFAULT 'NEW',
    "parsedCategory" TEXT,
    "parsedSpecs" JSONB,
    "parseConfidence" DOUBLE PRECISION,
    "parseError" TEXT,
    "marketplacePrices" JSONB,
    "marketplaceQuery" TEXT,
    "marketplaceFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqMessage" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "channel" "RfqChannel" NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfqMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "rfqId" TEXT,
    "buyerName" TEXT NOT NULL DEFAULT '',
    "buyerCompany" TEXT NOT NULL DEFAULT '',
    "buyerEmail" TEXT NOT NULL DEFAULT '',
    "buyerPhone" TEXT NOT NULL DEFAULT '',
    "buyerState" TEXT NOT NULL DEFAULT '',
    "buyerAddress" TEXT NOT NULL DEFAULT '',
    "withGst" BOOLEAN NOT NULL DEFAULT true,
    "gstMode" TEXT NOT NULL DEFAULT 'AUTO',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherTaxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherTaxLabel" TEXT NOT NULL DEFAULT '',
    "deliveryCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "manualOverrides" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT NOT NULL DEFAULT '',
    "validUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "outboundMsgId" TEXT NOT NULL DEFAULT '',
    "threadRef" TEXT NOT NULL DEFAULT '',
    "needsAssistance" BOOLEAN NOT NULL DEFAULT false,
    "assistanceReason" TEXT NOT NULL DEFAULT '',
    "lastBuyerReplyAt" TIMESTAMP(3),
    "lastReplyIntent" "QuoteReplyIntent",
    "lastAnalysisSummary" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteMessage" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "channel" "RfqChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "messageId" TEXT NOT NULL DEFAULT '',
    "inReplyTo" TEXT NOT NULL DEFAULT '',
    "fromEmail" TEXT NOT NULL DEFAULT '',
    "toEmail" TEXT NOT NULL DEFAULT '',
    "intent" "QuoteReplyIntent",
    "analysis" JSONB NOT NULL DEFAULT '{}',
    "autoReplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLineItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "qty" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "whatsappId" TEXT,
    "preferredChannel" "VendorPreferredChannel" NOT NULL DEFAULT 'EMAIL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorCategory" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL DEFAULT '',
    "keywords" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "VendorCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorProductHistory" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "lastPrice" DECIMAL(14,2) NOT NULL,
    "lastQuotedAt" TIMESTAMP(3) NOT NULL,
    "sourceRfqId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorProductHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorOutreach" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL DEFAULT '',
    "threadRef" TEXT NOT NULL,
    "status" "VendorOutreachStatus" NOT NULL DEFAULT 'PENDING',
    "outboundSubject" TEXT NOT NULL DEFAULT '',
    "outboundBody" TEXT NOT NULL DEFAULT '',
    "outboundMsgId" TEXT NOT NULL DEFAULT '',
    "replyText" TEXT NOT NULL DEFAULT '',
    "replyMsgId" TEXT NOT NULL DEFAULT '',
    "quotedPrice" DECIMAL(14,2),
    "sentAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorOutreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppState" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppState_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "OrganisationStatus" NOT NULL DEFAULT 'ACTIVE',
    "baseCurrency" TEXT NOT NULL DEFAULT 'INR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "inventoryPolicy" "InventoryValuationMethod" NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
    "policyMetadata" JSONB NOT NULL DEFAULT '{"inventoryValuation":"WEIGHTED_AVERAGE","negativeStockAllowed":false}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalEntity" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "entityType" "LegalEntityType" NOT NULL,
    "pan" TEXT,
    "cin" TEXT,
    "tan" TEXT,
    "registeredAddress" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GSTRegistration" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "gstin" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "tradeName" TEXT,
    "registrationType" TEXT NOT NULL DEFAULT 'REGULAR',
    "effectiveFrom" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "filingFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GSTRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessLocation" (
    "id" TEXT NOT NULL,
    "gstRegistrationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "state" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'IN',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationMembership" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganisationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipRole" (
    "membershipId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipRole_pkey" PRIMARY KEY ("membershipId","roleId")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL DEFAULT 'ALLOW',

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "FiscalYear" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalPeriod" (
    "id" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "status" "FiscalPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSeries" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "gstRegistrationId" TEXT,
    "fiscalYearId" TEXT,
    "documentType" "DocumentType" NOT NULL,
    "code" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "suffix" TEXT NOT NULL DEFAULT '',
    "nextNumber" BIGINT NOT NULL DEFAULT 1,
    "padding" INTEGER NOT NULL DEFAULT 4,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "gstRegistrationId" TEXT,
    "code" TEXT NOT NULL,
    "type" "PartyType" NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "placeOfSupplyCode" TEXT,
    "creditLimit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "type" "AddressType" NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "state" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'IN',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "gstRegistrationId" TEXT NOT NULL,
    "businessLocationId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "valuationMethod" "InventoryValuationMethod" NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
    "policyMetadata" JSONB NOT NULL DEFAULT '{"negativeStockAllowed":false}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "correlationId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "hash" TEXT,
    "previousHash" TEXT,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "type" "SourceDocumentType" NOT NULL,
    "externalRef" TEXT,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentExtraction" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "status" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "engine" TEXT,
    "engineVersion" TEXT,
    "extractedData" JSONB,
    "confidence" DECIMAL(5,4),
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionDraft" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "documentExtractionId" TEXT,
    "partyId" TEXT,
    "type" "DocumentType" NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
    "documentDate" DATE,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "validatedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionDraftLine" (
    "id" TEXT NOT NULL,
    "transactionDraftId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "hsnCode" TEXT,
    "uqc" "UqcCode",
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxableValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "TransactionDraftLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftValidation" (
    "id" TEXT NOT NULL,
    "transactionDraftId" TEXT NOT NULL,
    "severity" "ValidationSeverity" NOT NULL,
    "code" TEXT NOT NULL,
    "fieldPath" TEXT,
    "message" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProformaInvoice" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "gstRegistrationId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "quoteId" TEXT,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATE NOT NULL,
    "validUntil" DATE,
    "placeOfSupplyCode" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "billingSnapshot" JSONB NOT NULL,
    "shippingSnapshot" JSONB,
    "terms" JSONB NOT NULL DEFAULT '{}',
    "issuedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProformaInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProformaInvoiceLine" (
    "id" TEXT NOT NULL,
    "proformaInvoiceId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "hsnCode" TEXT,
    "uqc" "UqcCode" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxableValue" DECIMAL(18,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cessAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ProformaInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "gstRegistrationId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "proformaInvoiceId" TEXT,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATE NOT NULL,
    "dueDate" DATE,
    "placeOfSupplyCode" TEXT NOT NULL,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "billingSnapshot" JSONB NOT NULL,
    "shippingSnapshot" JSONB,
    "immutableSnapshot" JSONB,
    "issuedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "hsnCode" TEXT,
    "uqc" "UqcCode" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxableValue" DECIMAL(18,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cessAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditDebitNote" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "gstRegistrationId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "number" TEXT NOT NULL,
    "noteType" "NoteType" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "immutableSnapshot" JSONB,
    "issuedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditDebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditDebitNoteLine" (
    "id" TEXT NOT NULL,
    "creditDebitNoteId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "hsnCode" TEXT,
    "uqc" "UqcCode" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "taxableValue" DECIMAL(18,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cessAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "CreditDebitNoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "gstRegistrationId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "type" "StockMovementType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "runningQuantity" DECIMAL(18,3),
    "runningAverageCost" DECIMAL(18,4),
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "reversedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityOnHand" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "quantityReserved" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "averageCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "inventoryValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryValuationLayer" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "movementId" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "averageCost" DECIMAL(18,4) NOT NULL,
    "inventoryValue" DECIMAL(18,2) NOT NULL,
    "policy" "InventoryValuationMethod" NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
    "policyMetadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryValuationLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartOfAccount" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "systemKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allowPosting" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "fiscalPeriodId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "entryDate" DATE NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "narration" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT,
    "postedAt" TIMESTAMP(3),
    "reversedEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "partyId" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dimensions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "partyId" TEXT,
    "accountId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "reference" TEXT,
    "instrumentDate" DATE,
    "clearedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstReturn" (
    "id" TEXT NOT NULL,
    "gstRegistrationId" TEXT NOT NULL,
    "type" "GstReturnType" NOT NULL,
    "period" TEXT NOT NULL,
    "status" "GstRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "summary" JSONB NOT NULL DEFAULT '{}',
    "preparedAt" TIMESTAMP(3),
    "filedAt" TIMESTAMP(3),
    "arn" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GstReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstReconciliation" (
    "id" TEXT NOT NULL,
    "gstRegistrationId" TEXT NOT NULL,
    "gstReturnId" TEXT,
    "invoiceId" TEXT,
    "externalInvoiceRef" TEXT,
    "status" "GstReconciliationStatus" NOT NULL DEFAULT 'UNMATCHED',
    "bookValues" JSONB NOT NULL DEFAULT '{}',
    "portalValues" JSONB NOT NULL DEFAULT '{}',
    "differences" JSONB NOT NULL DEFAULT '{}',
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GstReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstSubmission" (
    "id" TEXT NOT NULL,
    "gstReturnId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" "GstRecordStatus" NOT NULL,
    "requestPayload" JSONB NOT NULL,
    "responsePayload" JSONB,
    "acknowledgementRef" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GstSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EInvoiceRecord" (
    "id" TEXT NOT NULL,
    "gstRegistrationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "status" "ExternalRecordStatus" NOT NULL DEFAULT 'PENDING',
    "irn" TEXT,
    "acknowledgementNumber" TEXT,
    "acknowledgementDate" TIMESTAMP(3),
    "signedInvoice" JSONB,
    "signedQrCode" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EInvoiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EWayBillRecord" (
    "id" TEXT NOT NULL,
    "gstRegistrationId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "status" "ExternalRecordStatus" NOT NULL DEFAULT 'PENDING',
    "ewayBillNumber" TEXT,
    "generatedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "distanceKm" INTEGER,
    "transporterId" TEXT,
    "transporterName" TEXT,
    "vehicleNumber" TEXT,
    "transportMode" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EWayBillRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_active_idx" ON "Product"("active");

-- CreateIndex
CREATE INDEX "Product_organisationId_idx" ON "Product"("organisationId");

-- CreateIndex
CREATE INDEX "Product_hsnCode_idx" ON "Product"("hsnCode");

-- CreateIndex
CREATE INDEX "Rfq_channel_idx" ON "Rfq"("channel");

-- CreateIndex
CREATE INDEX "Rfq_status_idx" ON "Rfq"("status");

-- CreateIndex
CREATE INDEX "Rfq_createdAt_idx" ON "Rfq"("createdAt");

-- CreateIndex
CREATE INDEX "Rfq_sourceRef_idx" ON "Rfq"("sourceRef");

-- CreateIndex
CREATE INDEX "RfqMessage_rfqId_idx" ON "RfqMessage"("rfqId");

-- CreateIndex
CREATE INDEX "RfqMessage_createdAt_idx" ON "RfqMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quoteNumber_key" ON "Quote"("quoteNumber");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "Quote_createdAt_idx" ON "Quote"("createdAt");

-- CreateIndex
CREATE INDEX "Quote_rfqId_idx" ON "Quote"("rfqId");

-- CreateIndex
CREATE INDEX "Quote_outboundMsgId_idx" ON "Quote"("outboundMsgId");

-- CreateIndex
CREATE INDEX "Quote_threadRef_idx" ON "Quote"("threadRef");

-- CreateIndex
CREATE INDEX "Quote_needsAssistance_idx" ON "Quote"("needsAssistance");

-- CreateIndex
CREATE INDEX "Quote_buyerEmail_idx" ON "Quote"("buyerEmail");

-- CreateIndex
CREATE INDEX "QuoteMessage_quoteId_idx" ON "QuoteMessage"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteMessage_messageId_idx" ON "QuoteMessage"("messageId");

-- CreateIndex
CREATE INDEX "QuoteMessage_createdAt_idx" ON "QuoteMessage"("createdAt");

-- CreateIndex
CREATE INDEX "QuoteMessage_direction_idx" ON "QuoteMessage"("direction");

-- CreateIndex
CREATE INDEX "QuoteLineItem_quoteId_idx" ON "QuoteLineItem"("quoteId");

-- CreateIndex
CREATE INDEX "Vendor_name_idx" ON "Vendor"("name");

-- CreateIndex
CREATE INDEX "Vendor_phone_idx" ON "Vendor"("phone");

-- CreateIndex
CREATE INDEX "Vendor_email_idx" ON "Vendor"("email");

-- CreateIndex
CREATE INDEX "Vendor_active_idx" ON "Vendor"("active");

-- CreateIndex
CREATE INDEX "VendorCategory_category_idx" ON "VendorCategory"("category");

-- CreateIndex
CREATE INDEX "VendorCategory_vendorId_idx" ON "VendorCategory"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorCategory_vendorId_category_subcategory_key" ON "VendorCategory"("vendorId", "category", "subcategory");

-- CreateIndex
CREATE INDEX "VendorProductHistory_productKey_idx" ON "VendorProductHistory"("productKey");

-- CreateIndex
CREATE INDEX "VendorProductHistory_vendorId_idx" ON "VendorProductHistory"("vendorId");

-- CreateIndex
CREATE INDEX "VendorProductHistory_sourceRfqId_idx" ON "VendorProductHistory"("sourceRfqId");

-- CreateIndex
CREATE INDEX "VendorProductHistory_lastQuotedAt_idx" ON "VendorProductHistory"("lastQuotedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VendorProductHistory_vendorId_productKey_key" ON "VendorProductHistory"("vendorId", "productKey");

-- CreateIndex
CREATE UNIQUE INDEX "VendorOutreach_threadRef_key" ON "VendorOutreach"("threadRef");

-- CreateIndex
CREATE INDEX "VendorOutreach_rfqId_idx" ON "VendorOutreach"("rfqId");

-- CreateIndex
CREATE INDEX "VendorOutreach_vendorId_idx" ON "VendorOutreach"("vendorId");

-- CreateIndex
CREATE INDEX "VendorOutreach_outboundMsgId_idx" ON "VendorOutreach"("outboundMsgId");

-- CreateIndex
CREATE INDEX "VendorOutreach_status_idx" ON "VendorOutreach"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VendorOutreach_rfqId_vendorId_key" ON "VendorOutreach"("rfqId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_code_key" ON "Organisation"("code");

-- CreateIndex
CREATE INDEX "Organisation_status_idx" ON "Organisation"("status");

-- CreateIndex
CREATE INDEX "LegalEntity_organisationId_active_idx" ON "LegalEntity"("organisationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "LegalEntity_organisationId_legalName_key" ON "LegalEntity"("organisationId", "legalName");

-- CreateIndex
CREATE UNIQUE INDEX "LegalEntity_organisationId_pan_key" ON "LegalEntity"("organisationId", "pan");

-- CreateIndex
CREATE UNIQUE INDEX "GSTRegistration_gstin_key" ON "GSTRegistration"("gstin");

-- CreateIndex
CREATE INDEX "GSTRegistration_legalEntityId_active_idx" ON "GSTRegistration"("legalEntityId", "active");

-- CreateIndex
CREATE INDEX "GSTRegistration_stateCode_idx" ON "GSTRegistration"("stateCode");

-- CreateIndex
CREATE INDEX "BusinessLocation_gstRegistrationId_active_idx" ON "BusinessLocation"("gstRegistrationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessLocation_gstRegistrationId_code_key" ON "BusinessLocation"("gstRegistrationId", "code");

-- CreateIndex
CREATE INDEX "OrganisationMembership_userId_status_idx" ON "OrganisationMembership"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationMembership_organisationId_userId_key" ON "OrganisationMembership"("organisationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organisationId_code_key" ON "Role"("organisationId", "code");

-- CreateIndex
CREATE INDEX "MembershipRole_roleId_idx" ON "MembershipRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "FiscalYear_organisationId_startsOn_idx" ON "FiscalYear"("organisationId", "startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalYear_legalEntityId_startsOn_key" ON "FiscalYear"("legalEntityId", "startsOn");

-- CreateIndex
CREATE INDEX "FiscalPeriod_fiscalYearId_status_idx" ON "FiscalPeriod"("fiscalYearId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalPeriod_fiscalYearId_number_key" ON "FiscalPeriod"("fiscalYearId", "number");

-- CreateIndex
CREATE INDEX "DocumentSeries_gstRegistrationId_documentType_active_idx" ON "DocumentSeries"("gstRegistrationId", "documentType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSeries_organisationId_code_key" ON "DocumentSeries"("organisationId", "code");

-- CreateIndex
CREATE INDEX "Party_organisationId_legalName_idx" ON "Party"("organisationId", "legalName");

-- CreateIndex
CREATE INDEX "Party_gstin_idx" ON "Party"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "Party_organisationId_code_key" ON "Party"("organisationId", "code");

-- CreateIndex
CREATE INDEX "Address_partyId_type_idx" ON "Address"("partyId", "type");

-- CreateIndex
CREATE INDEX "Warehouse_gstRegistrationId_active_idx" ON "Warehouse"("gstRegistrationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_organisationId_code_key" ON "Warehouse"("organisationId", "code");

-- CreateIndex
CREATE INDEX "AuditEvent_organisationId_occurredAt_idx" ON "AuditEvent"("organisationId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");

-- CreateIndex
CREATE INDEX "SourceDocument_organisationId_receivedAt_idx" ON "SourceDocument"("organisationId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_organisationId_checksum_key" ON "SourceDocument"("organisationId", "checksum");

-- CreateIndex
CREATE INDEX "DocumentExtraction_sourceDocumentId_createdAt_idx" ON "DocumentExtraction"("sourceDocumentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentExtraction_status_idx" ON "DocumentExtraction"("status");

-- CreateIndex
CREATE INDEX "TransactionDraft_organisationId_status_createdAt_idx" ON "TransactionDraft"("organisationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TransactionDraft_sourceDocumentId_idx" ON "TransactionDraft"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "TransactionDraftLine_productId_idx" ON "TransactionDraftLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionDraftLine_transactionDraftId_lineNumber_key" ON "TransactionDraftLine"("transactionDraftId", "lineNumber");

-- CreateIndex
CREATE INDEX "DraftValidation_transactionDraftId_severity_idx" ON "DraftValidation"("transactionDraftId", "severity");

-- CreateIndex
CREATE INDEX "ProformaInvoice_organisationId_issueDate_idx" ON "ProformaInvoice"("organisationId", "issueDate");

-- CreateIndex
CREATE INDEX "ProformaInvoice_partyId_status_idx" ON "ProformaInvoice"("partyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProformaInvoice_gstRegistrationId_number_key" ON "ProformaInvoice"("gstRegistrationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ProformaInvoiceLine_proformaInvoiceId_lineNumber_key" ON "ProformaInvoiceLine"("proformaInvoiceId", "lineNumber");

-- CreateIndex
CREATE INDEX "Invoice_organisationId_issueDate_idx" ON "Invoice"("organisationId", "issueDate");

-- CreateIndex
CREATE INDEX "Invoice_partyId_status_dueDate_idx" ON "Invoice"("partyId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_gstRegistrationId_number_key" ON "Invoice"("gstRegistrationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_lineNumber_key" ON "InvoiceLine"("invoiceId", "lineNumber");

-- CreateIndex
CREATE INDEX "CreditDebitNote_partyId_issueDate_idx" ON "CreditDebitNote"("partyId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "CreditDebitNote_gstRegistrationId_number_key" ON "CreditDebitNote"("gstRegistrationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "CreditDebitNoteLine_creditDebitNoteId_lineNumber_key" ON "CreditDebitNoteLine"("creditDebitNoteId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_idempotencyKey_key" ON "StockMovement"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_reversedById_key" ON "StockMovement"("reversedById");

-- CreateIndex
CREATE INDEX "StockMovement_warehouseId_productId_occurredAt_idx" ON "StockMovement"("warehouseId", "productId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockMovement_sourceType_sourceId_idx" ON "StockMovement"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_warehouseId_productId_key" ON "StockBalance"("warehouseId", "productId");

-- CreateIndex
CREATE INDEX "InventoryValuationLayer_warehouseId_productId_asOf_idx" ON "InventoryValuationLayer"("warehouseId", "productId", "asOf");

-- CreateIndex
CREATE INDEX "ChartOfAccount_organisationId_type_active_idx" ON "ChartOfAccount"("organisationId", "type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_legalEntityId_code_key" ON "ChartOfAccount"("legalEntityId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_legalEntityId_systemKey_key" ON "ChartOfAccount"("legalEntityId", "systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_idempotencyKey_key" ON "JournalEntry"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversedEntryId_key" ON "JournalEntry"("reversedEntryId");

-- CreateIndex
CREATE INDEX "JournalEntry_organisationId_entryDate_status_idx" ON "JournalEntry"("organisationId", "entryDate", "status");

-- CreateIndex
CREATE INDEX "JournalEntry_sourceType_sourceId_idx" ON "JournalEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_legalEntityId_number_key" ON "JournalEntry"("legalEntityId", "number");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE INDEX "JournalLine_partyId_idx" ON "JournalLine"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalLine_journalEntryId_lineNumber_key" ON "JournalLine"("journalEntryId", "lineNumber");

-- CreateIndex
CREATE INDEX "Payment_partyId_paymentDate_idx" ON "Payment"("partyId", "paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organisationId_number_key" ON "Payment"("organisationId", "number");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_invoiceId_key" ON "PaymentAllocation"("paymentId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "GstReturn_supersedesId_key" ON "GstReturn"("supersedesId");

-- CreateIndex
CREATE INDEX "GstReturn_gstRegistrationId_period_status_idx" ON "GstReturn"("gstRegistrationId", "period", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GstReturn_gstRegistrationId_type_period_version_key" ON "GstReturn"("gstRegistrationId", "type", "period", "version");

-- CreateIndex
CREATE INDEX "GstReconciliation_gstRegistrationId_status_idx" ON "GstReconciliation"("gstRegistrationId", "status");

-- CreateIndex
CREATE INDEX "GstReconciliation_gstReturnId_idx" ON "GstReconciliation"("gstReturnId");

-- CreateIndex
CREATE UNIQUE INDEX "GstSubmission_gstReturnId_attempt_key" ON "GstSubmission"("gstReturnId", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "EInvoiceRecord_irn_key" ON "EInvoiceRecord"("irn");

-- CreateIndex
CREATE INDEX "EInvoiceRecord_gstRegistrationId_status_idx" ON "EInvoiceRecord"("gstRegistrationId", "status");

-- CreateIndex
CREATE INDEX "EInvoiceRecord_invoiceId_idx" ON "EInvoiceRecord"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "EWayBillRecord_ewayBillNumber_key" ON "EWayBillRecord"("ewayBillNumber");

-- CreateIndex
CREATE INDEX "EWayBillRecord_gstRegistrationId_status_idx" ON "EWayBillRecord"("gstRegistrationId", "status");

-- CreateIndex
CREATE INDEX "EWayBillRecord_invoiceId_idx" ON "EWayBillRecord"("invoiceId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqMessage" ADD CONSTRAINT "RfqMessage_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteMessage" ADD CONSTRAINT "QuoteMessage_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLineItem" ADD CONSTRAINT "QuoteLineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLineItem" ADD CONSTRAINT "QuoteLineItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCategory" ADD CONSTRAINT "VendorCategory_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProductHistory" ADD CONSTRAINT "VendorProductHistory_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProductHistory" ADD CONSTRAINT "VendorProductHistory_sourceRfqId_fkey" FOREIGN KEY ("sourceRfqId") REFERENCES "Rfq"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorOutreach" ADD CONSTRAINT "VendorOutreach_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorOutreach" ADD CONSTRAINT "VendorOutreach_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalEntity" ADD CONSTRAINT "LegalEntity_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GSTRegistration" ADD CONSTRAINT "GSTRegistration_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessLocation" ADD CONSTRAINT "BusinessLocation_gstRegistrationId_fkey" FOREIGN KEY ("gstRegistrationId") REFERENCES "GSTRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationMembership" ADD CONSTRAINT "OrganisationMembership_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationMembership" ADD CONSTRAINT "OrganisationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRole" ADD CONSTRAINT "MembershipRole_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrganisationMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRole" ADD CONSTRAINT "MembershipRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalPeriod" ADD CONSTRAINT "FiscalPeriod_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSeries" ADD CONSTRAINT "DocumentSeries_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSeries" ADD CONSTRAINT "DocumentSeries_gstRegistrationId_fkey" FOREIGN KEY ("gstRegistrationId") REFERENCES "GSTRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSeries" ADD CONSTRAINT "DocumentSeries_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_gstRegistrationId_fkey" FOREIGN KEY ("gstRegistrationId") REFERENCES "GSTRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_gstRegistrationId_fkey" FOREIGN KEY ("gstRegistrationId") REFERENCES "GSTRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionDraft" ADD CONSTRAINT "TransactionDraft_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionDraft" ADD CONSTRAINT "TransactionDraft_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionDraft" ADD CONSTRAINT "TransactionDraft_documentExtractionId_fkey" FOREIGN KEY ("documentExtractionId") REFERENCES "DocumentExtraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionDraft" ADD CONSTRAINT "TransactionDraft_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionDraftLine" ADD CONSTRAINT "TransactionDraftLine_transactionDraftId_fkey" FOREIGN KEY ("transactionDraftId") REFERENCES "TransactionDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionDraftLine" ADD CONSTRAINT "TransactionDraftLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftValidation" ADD CONSTRAINT "DraftValidation_transactionDraftId_fkey" FOREIGN KEY ("transactionDraftId") REFERENCES "TransactionDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_gstRegistrationId_fkey" FOREIGN KEY ("gstRegistrationId") REFERENCES "GSTRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaInvoiceLine" ADD CONSTRAINT "ProformaInvoiceLine_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "ProformaInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProformaInvoiceLine" ADD CONSTRAINT "ProformaInvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_gstRegistrationId_fkey" FOREIGN KEY ("gstRegistrationId") REFERENCES "GSTRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "ProformaInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditDebitNote" ADD CONSTRAINT "CreditDebitNote_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditDebitNote" ADD CONSTRAINT "CreditDebitNote_gstRegistrationId_fkey" FOREIGN KEY ("gstRegistrationId") REFERENCES "GSTRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditDebitNote" ADD CONSTRAINT "CreditDebitNote_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditDebitNote" ADD CONSTRAINT "CreditDebitNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditDebitNoteLine" ADD CONSTRAINT "CreditDebitNoteLine_creditDebitNoteId_fkey" FOREIGN KEY ("creditDebitNoteId") REFERENCES "CreditDebitNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditDebitNoteLine" ADD CONSTRAINT "CreditDebitNoteLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_gstRegistrationId_fkey" FOREIGN KEY ("gstRegistrationId") REFERENCES "GSTRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryValuationLayer" ADD CONSTRAINT "InventoryValuationLayer_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryValuationLayer" ADD CONSTRAINT "InventoryValuationLayer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "FiscalPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversedEntryId_fkey" FOREIGN KEY ("reversedEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstReturn" ADD CONSTRAINT "GstReturn_gstRegistrationId_fkey" FOREIGN KEY ("gstRegistrationId") REFERENCES "GSTRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstReturn" ADD CONSTRAINT "GstReturn_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "GstReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstReconciliation" ADD CONSTRAINT "GstReconciliation_gstRegistrationId_fkey" FOREIGN KEY ("gstRegistrationId") REFERENCES "GSTRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstReconciliation" ADD CONSTRAINT "GstReconciliation_gstReturnId_fkey" FOREIGN KEY ("gstReturnId") REFERENCES "GstReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstReconciliation" ADD CONSTRAINT "GstReconciliation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstSubmission" ADD CONSTRAINT "GstSubmission_gstReturnId_fkey" FOREIGN KEY ("gstReturnId") REFERENCES "GstReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceRecord" ADD CONSTRAINT "EInvoiceRecord_gstRegistrationId_fkey" FOREIGN KEY ("gstRegistrationId") REFERENCES "GSTRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceRecord" ADD CONSTRAINT "EInvoiceRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EWayBillRecord" ADD CONSTRAINT "EWayBillRecord_gstRegistrationId_fkey" FOREIGN KEY ("gstRegistrationId") REFERENCES "GSTRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EWayBillRecord" ADD CONSTRAINT "EWayBillRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
