import re
from typing import Dict, Any, List
from nltk.tokenize import word_tokenize, sent_tokenize
from nltk.corpus import stopwords
import nltk

class SEOOptimizer:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        
        # Download required NLTK data
        nltk.download('punkt')
        nltk.download('stopwords')
        
        self.stop_words = set(stopwords.words('english'))
    
    async def optimize(self, content: str, keywords: List[str]) -> str:
        """Optimize content for SEO."""
        # Check keyword density
        current_density = self._calculate_keyword_density(content, keywords)
        
        if current_density < self.config['keyword_density']:
            # Add keywords naturally if density is too low
            content = self._increase_keyword_density(content, keywords)
        elif current_density > self.config['max_keyword_density']:
            # Remove some keywords if density is too high
            content = self._decrease_keyword_density(content, keywords)
        
        # Optimize headings
        content = self._optimize_headings(content, keywords)
        
        # Add meta description if not present
        if not self._has_meta_description(content):
            content = self._add_meta_description(content, keywords)
        
        # Optimize URL-friendly terms
        content = self._optimize_urls(content)
        
        return content
    
    def _calculate_keyword_density(self, content: str, keywords: List[str]) -> float:
        """Calculate keyword density in the content."""
        words = word_tokenize(content.lower())
        total_words = len([w for w in words if w not in self.stop_words])
        
        if total_words == 0:
            return 0
        
        keyword_count = 0
        for keyword in keywords:
            # Count occurrences of each keyword
            keyword_tokens = word_tokenize(keyword.lower())
            for i in range(len(words) - len(keyword_tokens) + 1):
                if words[i:i + len(keyword_tokens)] == keyword_tokens:
                    keyword_count += 1
        
        return keyword_count / total_words
    
    def _increase_keyword_density(self, content: str, keywords: List[str]) -> str:
        """Increase keyword density by adding keywords naturally."""
        sentences = sent_tokenize(content)
        target_density = self.config['keyword_density']
        
        # Add keywords to appropriate positions
        for i, sentence in enumerate(sentences):
            if i % 3 == 0:  # Add keyword every third sentence
                keyword = keywords[i % len(keywords)]
                if not self._contains_keyword(sentence, keyword):
                    sentences[i] = self._insert_keyword(sentence, keyword)
            
            # Check if we've reached target density
            new_content = ' '.join(sentences)
            if self._calculate_keyword_density(new_content, keywords) >= target_density:
                break
        
        return ' '.join(sentences)
    
    def _decrease_keyword_density(self, content: str, keywords: List[str]) -> str:
        """Decrease keyword density by removing some keyword instances."""
        sentences = sent_tokenize(content)
        target_density = self.config['keyword_density']
        
        # Remove keywords from sentences that have multiple occurrences
        for i, sentence in enumerate(sentences):
            for keyword in keywords:
                if self._count_keyword_occurrences(sentence, keyword) > 1:
                    sentences[i] = self._remove_keyword(sentence, keyword)
            
            # Check if we've reached target density
            new_content = ' '.join(sentences)
            if self._calculate_keyword_density(new_content, keywords) <= target_density:
                break
        
        return ' '.join(sentences)
    
    def _optimize_headings(self, content: str, keywords: List[str]) -> str:
        """Optimize headings by including keywords where appropriate."""
        lines = content.split('\n')
        
        for i, line in enumerate(lines):
            if line.startswith('#'):  # Markdown heading
                # Check if heading already contains a keyword
                has_keyword = any(keyword.lower() in line.lower() for keyword in keywords)
                
                if not has_keyword and len(keywords) > 0:
                    # Add the most relevant keyword to the heading
                    heading_level = len(re.match(r'^#+', line).group())
                    heading_text = line[heading_level:].strip()
                    
                    # Choose the most relevant keyword
                    keyword = keywords[0]  # Use first keyword as default
                    for k in keywords:
                        if k.lower() in heading_text.lower():
                            keyword = k
                            break
                    
                    # Add keyword if it fits naturally
                    if len(heading_text) + len(keyword) + 3 <= 60:  # Keep headings reasonable
                        lines[i] = f"{'#' * heading_level} {keyword}: {heading_text}"
        
        return '\n'.join(lines)
    
    def _has_meta_description(self, content: str) -> bool:
        """Check if content has a meta description."""
        return '<!-- meta-description' in content.lower()
    
    def _add_meta_description(self, content: str, keywords: List[str]) -> str:
        """Add SEO-friendly meta description."""
        # Extract first paragraph for meta description
        sentences = sent_tokenize(content)
        if not sentences:
            return content
        
        # Create meta description with keywords
        description = sentences[0]
        if len(description) > self.config['meta_description_length']:
            description = description[:self.config['meta_description_length']] + '...'
        
        # Add keywords if they're not already present
        for keyword in keywords:
            if keyword.lower() not in description.lower():
                if len(description) + len(keyword) + 5 <= self.config['meta_description_length']:
                    description = f"{description} {keyword}."
        
        # Add meta description to content
        meta_tag = f'\n<!-- meta-description: {description} -->\n'
        return meta_tag + content
    
    def _optimize_urls(self, content: str) -> str:
        """Optimize URLs in content for SEO."""
        # Find URLs in content
        url_pattern = r'\[([^\]]+)\]\(([^\)]+)\)'
        
        def optimize_url_match(match):
            text, url = match.groups()
            # Remove special characters and spaces
            optimized_url = re.sub(r'[^\w\s-]', '', url.lower())
            optimized_url = re.sub(r'[-\s]+', '-', optimized_url)
            return f'[{text}]({optimized_url})'
        
        return re.sub(url_pattern, optimize_url_match, content)
    
    def _contains_keyword(self, text: str, keyword: str) -> bool:
        """Check if text contains the keyword."""
        return keyword.lower() in text.lower()
    
    def _count_keyword_occurrences(self, text: str, keyword: str) -> int:
        """Count occurrences of keyword in text."""
        return text.lower().count(keyword.lower())
    
    def _insert_keyword(self, sentence: str, keyword: str) -> str:
        """Insert keyword naturally into the sentence."""
        # Try to insert after the subject
        words = word_tokenize(sentence)
        pos_tags = nltk.pos_tag(words)
        
        # Find the first noun or pronoun
        for i, (word, tag) in enumerate(pos_tags):
            if tag.startswith(('NN', 'PRP')):
                # Insert after the noun/pronoun
                words.insert(i + 1, keyword)
                return ' '.join(words)
        
        # If no good position found, append to the end
        return f"{sentence} {keyword}"
    
    def _remove_keyword(self, sentence: str, keyword: str) -> str:
        """Remove one instance of the keyword from the sentence."""
        # Remove only one instance to maintain readability
        return sentence.replace(keyword, '', 1) 