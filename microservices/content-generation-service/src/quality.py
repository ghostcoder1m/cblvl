import re
from typing import Dict, Any, List, Tuple
import nltk
from nltk.tokenize import sent_tokenize, word_tokenize

class QualityChecker:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        
        # Download required NLTK data
        nltk.download('punkt')
        nltk.download('averaged_perceptron_tagger')
        
    async def check(self, content: str) -> float:
        """Check content quality and return a score between 0 and 100."""
        scores = []
        
        # Check readability
        readability_score = self._check_readability(content)
        scores.append(readability_score * 0.4)  # 40% weight
        
        # Check sentence structure
        structure_score = self._check_sentence_structure(content)
        scores.append(structure_score * 0.3)  # 30% weight
        
        # Check content diversity
        diversity_score = self._check_content_diversity(content)
        scores.append(diversity_score * 0.3)  # 30% weight
        
        # Calculate final score
        final_score = sum(scores)
        
        return min(max(final_score, 0), 100)  # Ensure score is between 0 and 100
    
    def _check_readability(self, content: str) -> float:
        """Calculate readability score using Flesch Reading Ease."""
        sentences = sent_tokenize(content)
        words = word_tokenize(content)
        
        if not sentences or not words:
            return 0
        
        # Calculate average sentence length
        avg_sentence_length = len(words) / len(sentences)
        
        # Calculate average syllables per word
        syllables = sum(self._count_syllables(word) for word in words)
        avg_syllables = syllables / len(words)
        
        # Flesch Reading Ease formula
        score = 206.835 - (1.015 * avg_sentence_length) - (84.6 * avg_syllables)
        
        # Normalize score to 0-100 range
        normalized_score = min(max(score, 0), 100)
        
        return normalized_score
    
    def _check_sentence_structure(self, content: str) -> float:
        """Check sentence structure variety and complexity."""
        sentences = sent_tokenize(content)
        
        if not sentences:
            return 0
        
        scores = []
        
        for sentence in sentences:
            # Tokenize and tag parts of speech
            tokens = word_tokenize(sentence)
            pos_tags = nltk.pos_tag(tokens)
            
            # Check for variety in sentence beginnings
            if pos_tags and pos_tags[0][1].startswith('DT'):  # Starts with determiner
                scores.append(0.8)  # Slight penalty for starting with "The", "A", etc.
            else:
                scores.append(1.0)
            
            # Check sentence length (penalize very short or very long sentences)
            length = len(tokens)
            if length < 5:
                scores.append(0.7)  # Penalty for very short sentences
            elif length > 35:
                scores.append(0.6)  # Penalty for very long sentences
            else:
                scores.append(1.0)
            
            # Check for presence of subordinate clauses
            if any(tag in ['IN', 'WDT', 'WP', 'WRB'] for _, tag in pos_tags):
                scores.append(1.2)  # Bonus for complex sentence structure
            else:
                scores.append(1.0)
        
        # Calculate average score
        avg_score = sum(scores) / len(scores)
        
        # Normalize to 0-100 range
        return min(max(avg_score * 80, 0), 100)  # Scale to max 100
    
    def _check_content_diversity(self, content: str) -> float:
        """Check content diversity and vocabulary richness."""
        words = word_tokenize(content.lower())
        
        if not words:
            return 0
        
        # Calculate type-token ratio (unique words / total words)
        unique_words = len(set(words))
        total_words = len(words)
        ttr = unique_words / total_words
        
        # Calculate score based on type-token ratio
        # TTR typically ranges from 0.4 to 0.7 for good content
        if ttr < 0.4:
            score = ttr * 200  # Scale up low diversity
        elif ttr > 0.7:
            score = 100  # Maximum score for high diversity
        else:
            score = (ttr - 0.4) * 333  # Scale middle range to 0-100
        
        return min(max(score, 0), 100)
    
    def _count_syllables(self, word: str) -> int:
        """Count the number of syllables in a word."""
        word = word.lower()
        count = 0
        vowels = 'aeiouy'
        
        # Handle special cases
        if word.endswith('e'):
            word = word[:-1]
        
        # Count vowel groups
        prev_char_is_vowel = False
        for char in word:
            is_vowel = char in vowels
            if is_vowel and not prev_char_is_vowel:
                count += 1
            prev_char_is_vowel = is_vowel
        
        # Ensure at least one syllable
        return max(count, 1) 