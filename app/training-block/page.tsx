import {redirect} from 'next/navigation';

const TrainingBlockPage = () => {
  redirect('/training-plan?tab=block');
};

export default TrainingBlockPage;
