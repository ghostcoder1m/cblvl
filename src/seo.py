from typing import List
from nltk import word_tokenize

class SEOOptimizer:
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
            keyword_length = len(keyword_tokens)
            
            for i in range(len(words) - keyword_length + 1):
                if words[i:i + keyword_length] == keyword_tokens:
                    keyword_count += 1
        
        # Calculate density based on total words
        density = keyword_count / total_words
        
        return density 