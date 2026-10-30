REVOKE INSERT ON public.audit_log FROM authenticated;
DROP POLICY IF EXISTS "Signed-in users can write audit entries" ON public.audit_log;
CREATE OR REPLACE FUNCTION public.audit_company_settings_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN INSERT INTO public.audit_log(company_slug,user_id,action,details) VALUES (NEW.company_slug,auth.uid(),'settings.changed',jsonb_build_object('verified',true,'scan_retention_days',NEW.scan_retention_days,'alert_retention_days',NEW.alert_retention_days,'epc_tag_prefix',NEW.epc_tag_prefix)); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.audit_company_settings_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_company_settings_change AFTER INSERT OR UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.audit_company_settings_change();
CREATE TABLE public.handheld_submissions(id uuid PRIMARY KEY,company_slug text NOT NULL,user_id uuid NOT NULL,request_data jsonb NOT NULL,accepted integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.handheld_submissions TO authenticated;
GRANT ALL ON public.handheld_submissions TO service_role;
ALTER TABLE public.handheld_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own handheld receipts" ON public.handheld_submissions FOR SELECT TO authenticated USING(user_id=auth.uid() AND company_slug=public.get_user_company_slug(auth.uid()));
CREATE INDEX handheld_submissions_company_created_idx ON public.handheld_submissions(company_slug,created_at);
CREATE OR REPLACE FUNCTION public.submit_handheld_scan(_id uuid,_operation text,_location text,_source text,_tags jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tenant text; request_value jsonb; prior public.handheld_submissions%ROWTYPE; entry jsonb; tag_epc text; tag_count integer; affected integer; accepted_count integer:=0;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 tenant:=public.get_user_company_slug(auth.uid());
 IF tenant IS NULL OR NOT EXISTS(SELECT 1 FROM public.companies WHERE slug=tenant) THEN RAISE EXCEPTION 'Registered company required'; END IF;
 IF _operation NOT IN ('goods-in','stock-check','stock-movement') OR coalesce(length(trim(_location)),0)=0 OR length(_location)>255 THEN RAISE EXCEPTION 'Invalid handheld operation'; END IF;
 IF jsonb_typeof(_tags) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid tags'; END IF;
 IF jsonb_array_length(_tags)<1 OR jsonb_array_length(_tags)>5000 THEN RAISE EXCEPTION 'Submit between 1 and 5000 tags'; END IF;
 IF _operation='stock-movement' AND (coalesce(length(trim(_source)),0)=0 OR _source=_location) THEN RAISE EXCEPTION 'Different source and destination required'; END IF;
 request_value:=jsonb_build_object('operation',_operation,'location',_location,'source',_source,'tags',_tags);
 PERFORM pg_advisory_xact_lock(hashtextextended(_id::text,0));
 SELECT * INTO prior FROM public.handheld_submissions WHERE id=_id;
 IF FOUND THEN
  IF prior.user_id<>auth.uid() OR prior.company_slug<>tenant OR prior.request_data<>request_value THEN RAISE EXCEPTION 'Submission ID already used for different data'; END IF;
  RETURN prior.accepted;
 END IF;
 IF (SELECT count(DISTINCT value->>0) FROM jsonb_array_elements(_tags))<>jsonb_array_length(_tags) THEN RAISE EXCEPTION 'Duplicate tag in submission'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(_tags) LOOP
  tag_epc:=upper(entry->>0);
  IF tag_epc !~ '^3039[0-9A-F]+$' OR length(tag_epc)>256 OR coalesce(entry->>1,'') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Invalid handheld tag'; END IF;
  tag_count:=(entry->>1)::integer;
  IF tag_count<1 OR tag_count>1000000 THEN RAISE EXCEPTION 'Invalid read count'; END IF;
  IF _operation='stock-movement' THEN
   UPDATE public.rfid_scans SET location=_location,last_seen=now() WHERE company_slug=tenant AND epc=tag_epc AND location=_source;
   GET DIAGNOSTICS affected=ROW_COUNT;
   IF affected<>1 THEN RAISE EXCEPTION 'Source stock changed; refresh and scan again'; END IF;
  ELSE
   INSERT INTO public.rfid_scans(company_slug,epc,first_seen,last_seen,scan_count,location) VALUES(tenant,tag_epc,now(),now(),tag_count,_location)
   ON CONFLICT(company_slug,epc) DO UPDATE SET last_seen=excluded.last_seen,location=excluded.location,scan_count=CASE WHEN _operation='goods-in' THEN public.rfid_scans.scan_count+excluded.scan_count ELSE excluded.scan_count END;
  END IF;
  accepted_count:=accepted_count+1;
 END LOOP;
 INSERT INTO public.handheld_submissions(id,company_slug,user_id,request_data,accepted) VALUES(_id,tenant,auth.uid(),request_value,accepted_count);
 INSERT INTO public.audit_log(company_slug,user_id,action,details) VALUES(tenant,auth.uid(),'handheld.'||_operation,jsonb_build_object('verified',true,'submission_id',_id,'accepted',accepted_count,'location',_location,'source',_source));
 RETURN accepted_count;
END $$;
REVOKE ALL ON FUNCTION public.submit_handheld_scan(uuid,text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_handheld_scan(uuid,text,text,text,jsonb) TO authenticated;
COMMENT ON TABLE public.handheld_submissions IS 'Idempotency receipts for explicit handheld submission. Retain receipts while supported retries remain possible; not a raw RFID observation log.';