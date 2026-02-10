# Agent Analysis Results Feature - Deployment Guide

## Summary

Successfully implemented agent analysis results display with:
- Toast notifications for analysis completion
- New "Analysis" column in document table
- Modal for viewing full analysis with markdown formatting
- Database queries for fetching agent analyses

## Files Created/Modified

### New Files Created:
1. `/src/hooks/use-toast.ts` - Toast notification hook
2. `/src/components/toaster.tsx` - Toast notification component
3. `/src/components/analysis-modal.tsx` - Modal for viewing full analysis
4. `/src/app/api/documents/analyses/route.ts` - API endpoint for fetching analyses

### Files Modified:
1. `/src/lib/db.ts` - Added `getDocumentAnalyses()` function
2. `/src/components/document-table.tsx` - Added analysis column, toast integration, modal integration
3. `/src/app/layout.tsx` - Added Toaster component

## Features Implemented

### 1. Toast Notifications
- Success toast when agent analysis completes
- Shows agent name, color, and document title
- Error handling for failed analyses
- Auto-dismiss after 3 seconds

### 2. Analysis Column
- Located between "Created" and "Embedding" columns
- Shows up to 2 most recent analyses per document
- Each analysis shows:
  - Agent avatar (colored circle)
  - First ~80 characters of analysis text
  - Clickable to view full analysis
- Shows "+X more" if there are additional analyses
- Displays "No analyses" if none exist
- Loading state while fetching

### 3. Analysis Modal
- Full agent response with markdown formatting
- Agent name and color indicator
- Timestamp
- Scrollable content area
- Proper heading, paragraph, and list formatting

### 4. Database Integration
- Queries `quorum_events` table for `event_type='agent_analysis'`
- Parses `metadata.source` for agent name
- Returns analyses sorted by most recent
- API endpoint for client-side fetching

## Deployment Instructions

### Option 1: Manual Deployment (Recommended if SSH fails)

1. **Build the application locally:**
   ```bash
   cd /Users/dean/quorum-dashboard
   npm run build
   ```

2. **Copy files to Mac Mini:**
   ```bash
   # Copy the .next directory and other necessary files
   rsync -avz --delete \
     .next/ \
     package.json \
     package-lock.json \
     public/ \
     src/ \
     .env.local \
     root@192.168.20.36:/path/to/quorum-dashboard/
   ```

3. **On Mac Mini, restart the application:**
   ```bash
   cd /path/to/quorum-dashboard
   npm install --production
   pm2 restart quorum-dashboard
   # or if using systemd:
   # sudo systemctl restart quorum-dashboard
   ```

### Option 2: Fix SSH and Deploy

1. **Fix SSH authentication:**
   - Check if your SSH public key is on the Mac Mini:
     ```bash
     cat ~/.ssh/id_ed25519.pub
     ```
   - Add it to Mac Mini's authorized_keys if needed:
     ```bash
     ssh-copy-id -i ~/.ssh/id_ed25519 root@192.168.20.36
     ```

2. **Deploy using git:**
   ```bash
   # If quorum-dashboard is a git repo on Mac Mini
   git push origin main  # or whatever branch you use
   ssh root@192.168.20.36 "cd /path/to/quorum-dashboard && git pull && npm run build && pm2 restart quorum-dashboard"
   ```

### Option 3: Direct Deployment via SCP

```bash
# Build first
npm run build

# Copy build output
scp -r .next root@192.168.20.36:/path/to/quorum-dashboard/
scp -r src root@192.168.20.36:/path/to/quorum-dashboard/
scp package*.json root@192.168.20.36:/path/to/quorum-dashboard/

# SSH and restart
ssh root@192.168.20.36
cd /path/to/quorum-dashboard
npm run build
pm2 restart quorum-dashboard
```

## Testing the Feature

Once deployed, test the feature:

1. Navigate to the Documents page
2. Click "Analyze" dropdown on any document
3. Select an agent (e.g., "The Connector")
4. Wait for analysis to complete
5. Verify:
   - Toast notification appears with agent name and document title
   - Analysis column shows new analysis with agent color and preview text
   - Click analysis preview to open modal
   - Modal shows full formatted analysis with agent info

## Database Verification

Check if analyses are being stored:

```sql
-- View recent agent analyses
SELECT
  id,
  title,
  metadata->>'source' as agent_name,
  metadata->>'document_id' as document_id,
  created_at
FROM quorum_events
WHERE event_type = 'agent_analysis'
ORDER BY created_at DESC
LIMIT 10;
```

## Troubleshooting

### Analyses Not Showing
- Check browser console for API errors
- Verify database connection in `/src/app/api/documents/analyses/route.ts`
- Ensure `quorum_events` table has `agent_analysis` events

### Toast Not Appearing
- Check that `<Toaster />` is in `/src/app/layout.tsx`
- Verify `useToast()` hook is properly called in `document-table.tsx`

### Modal Not Opening
- Check that `AnalysisModal` component is imported
- Verify `handleViewAnalysis` is bound to click events

## Build Output

Build completed successfully with these routes:
- `/api/documents/analyses` - New endpoint for fetching analyses
- All existing routes remain functional
- No TypeScript errors
- All components properly typed

## Next Steps

1. Resolve SSH authentication for automated deployment
2. Test the feature with actual agent analyses
3. Consider adding:
   - Analysis filtering by agent
   - Export analysis as text/markdown
   - Analysis comparison view
   - Timestamp sorting options
