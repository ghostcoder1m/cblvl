import os
from jinja2 import Environment, FileSystemLoader, select_autoescape

def load_templates():
    """Load Jinja2 templates for different content formats."""
    template_dir = os.path.join(os.path.dirname(__file__), '../templates')
    
    # Create templates directory if it doesn't exist
    os.makedirs(template_dir, exist_ok=True)
    
    # Initialize Jinja2 environment
    env = Environment(
        loader=FileSystemLoader(template_dir),
        autoescape=select_autoescape(['html', 'xml']),
        trim_blocks=True,
        lstrip_blocks=True
    )
    
    # Create default templates if they don't exist
    _create_default_templates(template_dir)
    
    return env

def _create_default_templates(template_dir: str):
    """Create default templates for different content formats."""
    templates = {
        'article.j2': '''
{%- set title = topic.term|title %}
{%- set category = topic.metadata.category|default('general') %}

# {{ title }}

{{ sections.introduction }}

{% for point in sections.main_points.split('\n') %}
## {{ point|title }}
{% endfor %}

{{ sections.analysis }}

## Conclusion
{{ sections.conclusion }}

---
*Generated on {{ metadata.generated_at }} | Category: {{ category }}*
''',
        
        'blog_post.j2': '''
{%- set title = topic.term|title %}

# {{ title }}

{{ sections.hook }}

{{ sections.body }}

## Key Takeaway
{{ sections.takeaway }}

---
*Published on {{ metadata.generated_at }}*
{% if metadata.target_audience %}
*Target Audience: {{ metadata.target_audience }}*
{% endif %}
''',
        
        'social_media.j2': '''
{%- set hashtags = topic.term.split()|map('regex_replace', '^', '#')|join(' ') %}
{{ sections.hook }}

{{ sections.body }}

{{ sections.takeaway }}

{{ hashtags }}
'''
    }
    
    for filename, content in templates.items():
        filepath = os.path.join(template_dir, filename)
        if not os.path.exists(filepath):
            with open(filepath, 'w') as f:
                f.write(content.lstrip()) 