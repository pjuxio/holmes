#!/usr/bin/env python3
"""
Convert TCLP Resources CSV export to resources.json format.
"""

import csv
import json
import re
import html
from pathlib import Path

def strip_html(text):
    """Remove HTML tags and WordPress block comments, decode entities."""
    if not text:
        return ""
    # Remove WordPress block comments
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', ' ', text)
    # Decode HTML entities
    text = html.unescape(text)
    # Remove standalone URLs (they clutter descriptions)
    text = re.sub(r'https?://\S+', '', text)
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def extract_description(content):
    """Extract a clean description from the Content field."""
    text = strip_html(content)
    # Limit to ~300 chars, break at sentence if possible
    if len(text) > 300:
        # Try to break at sentence
        sentences = re.split(r'(?<=[.!?])\s+', text[:400])
        desc = ""
        for s in sentences:
            if len(desc) + len(s) < 300:
                desc += s + " "
            else:
                break
        text = desc.strip() if desc.strip() else text[:300] + "..."
    return text

def parse_tags(tags_str, alignments):
    """Parse tags string and add alignment values as tags."""
    tags = []
    if tags_str:
        # Split by comma, clean up
        raw_tags = [t.strip() for t in tags_str.split(',') if t.strip()]
        tags.extend(raw_tags)
    
    # Add alignment fields as tags if they have values
    for alignment in alignments:
        if alignment and alignment.strip():
            tags.append(alignment.strip())
    
    return tags

def determine_type(categories):
    """Map WordPress categories to resource type."""
    if not categories:
        return "article"
    
    cats_lower = categories.lower()
    
    if 'video' in cats_lower or 'webinar' in cats_lower:
        return "video"
    elif 'toolkit' in cats_lower:
        return "toolkit"
    elif 'report' in cats_lower:
        return "report"
    elif 'guide' in cats_lower or 'how-to' in cats_lower:
        return "guide"
    elif 'data' in cats_lower or 'dataset' in cats_lower:
        return "dataset"
    elif 'podcast' in cats_lower or 'audio' in cats_lower:
        return "audio"
    elif 'case study' in cats_lower or 'case studies' in cats_lower:
        return "case study"
    else:
        return "article"

def convert_csv_to_json(csv_path, json_path):
    """Convert the CSV export to resources.json format."""
    resources = []
    
    with open(csv_path, 'r', encoding='utf-8-sig') as f:  # utf-8-sig handles BOM
        reader = csv.DictReader(f)
        
        for row in reader:
            # Skip non-published resources
            if row.get('Status', '').lower() != 'publish':
                continue
            
            # Determine URL: prefer Link field, fallback to Permalink
            url = row.get('Link', '').strip() or row.get('Permalink', '').strip()
            
            # Skip if no URL
            if not url:
                continue
            
            # Build resource object
            resource = {
                "id": str(row.get('ID', '')),
                "title": row.get('Title', '').strip(),
                "url": url,
                "description": extract_description(row.get('Content', '')),
                "tags": parse_tags(
                    row.get('Tags', ''),
                    [
                        row.get('Alignment: JTF', ''),
                        row.get('Alignment: Regenerative Economies', ''),
                        row.get('Alignment: Democratic Systems', '')
                    ]
                ),
                "org": (row.get('Organizational Author', '').strip() or 
                        row.get('Resource Author', '').strip()),
                "type": determine_type(row.get('Categories', ''))
            }
            
            # Add BIPOC Author flag as a tag if present
            if row.get('BIPOC Author', '').strip():
                resource['tags'].append('BIPOC-led')
            
            resources.append(resource)
    
    # Write JSON
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(resources, f, indent=2, ensure_ascii=False)
    
    print(f"Converted {len(resources)} resources to {json_path}")
    return len(resources)

if __name__ == '__main__':
    data_dir = Path(__file__).parent
    csv_file = data_dir / 'Resources-Export-2026-March-26-1329.csv'
    json_file = data_dir / 'resources.json'
    
    convert_csv_to_json(csv_file, json_file)
